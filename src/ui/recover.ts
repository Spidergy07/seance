// The recovery pipeline the shell runs when a URL is submitted. It wires the
// network clients, the pure core selection, the DOM rewriter, the recovery
// accounting, and the reader extraction into one typed outcome the UI renders.
//
// Everything with a side effect is injected (`fetch`, HTML parsing, document
// serialisation, the Readability factory), so the flow runs under linkedom in
// tests and under the browser in production. The end-to-end fixture test is
// task 22; this module exists so the shell is functional. See design.md §3.

import { fetchCaptures } from '../archive/cdx-client.js';
import type { ArchiveClientDeps } from '../archive/cdx-client.js';
import { createCdxCache, type CdxCache } from '../archive/cdx-cache.js';
import { fetchSnapshot } from '../archive/snapshot-client.js';
import { createCaptureLookup } from '../archive/capture-lookup.js';
import type { ClientErrorKind } from '../archive/result.js';
import { selectCapture, selectByTimestamp, byDate } from '../core/capture-select.js';
import { buildRecoveryReport } from '../core/recovery.js';
import { rewriteDocument } from '../dom/rewrite-document.js';
import { resolveAssetStatuses, DEFAULT_MAX_CHECKED_ASSETS } from '../dom/asset-status.js';
import { applyFlashNotices } from '../dom/flash.js';
import { extractReader } from '../dom/reader.js';
import type { ReaderDeps } from '../dom/reader.js';
import type { AssetStatus } from '../core/types.js';
import type { RewriteContext } from '../core/url-rewriter.js';
import type { RecoveryStep } from './progress.js';
import type { RecoveryErrorKind, RecoveryOutcome } from './types.js';

export interface RecoverDeps {
  /** The fetch used by the archive clients (our proxy only). */
  fetch: typeof fetch;
  /** Proxy origin; defaults to our own origin via a relative path. */
  baseUrl?: string;
  /** Parse an HTML string into a fresh Document (DOMParser / linkedom). */
  parseHtml: (html: string) => Document;
  /** Serialise a rewritten Document back to an HTML string for the iframe. */
  serialize: (doc: Document) => string;
  /** Readability factory passthrough; defaults to @mozilla/readability. */
  createReadability?: ReaderDeps['createReadability'];
  /** Max concurrent CDX asset lookups. */
  lookupConcurrency?: number;
  /**
   * Cap on distinct assets checked against the archive (R8.7). Defaults to
   * `DEFAULT_MAX_CHECKED_ASSETS`; assets past the cap are reported `unknown`.
   */
  maxCheckedAssets?: number;
  /**
   * Session cache of CDX answers (R8.8), shared across recoveries so a repeated
   * lookup of the same URL makes no new archive request.
   */
  cdxCache?: CdxCache;
  /** Overall recovery deadline in milliseconds (R8.9). Defaults to 20000. */
  deadlineMs?: number;
  /**
   * Create the deadline handle for one recovery. Injected in tests; defaults to
   * an `AbortController` aborted by a `setTimeout`.
   */
  createDeadline?: DeadlineFactory;
}

/** A recovery's deadline: a signal to abort fetches, and a timer to clear. */
export interface DeadlineHandle {
  signal: AbortSignal;
  /** Clear the timer once the recovery settles, so it cannot fire late. */
  cancel: () => void;
}

export type DeadlineFactory = (ms: number) => DeadlineHandle;

/** The default overall deadline: the whole recovery finishes or stops here. */
export const DEFAULT_DEADLINE_MS = 20000;

/** Real deadline: abort the shared controller when the timer fires. */
function defaultDeadline(ms: number): DeadlineHandle {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer);
    },
  };
}

/** Options for a single recovery run. */
export interface RecoverOptions {
  /**
   * Open this exact capture (14-digit Wayback timestamp) instead of the most
   * recent working one. Used by the capture picker (R2.4). Ignored when no
   * capture has that timestamp.
   */
  timestamp?: string;
  /**
   * Called as the recovery enters each step, so the shell can show which step
   * is running (R8.10).
   */
  onProgress?: (step: RecoveryStep) => void;
}

/** Map an archive client failure onto a recovery error kind (design.md §11). */
function mapClientError(kind: ClientErrorKind): RecoveryErrorKind {
  switch (kind) {
    case 'rate-limited':
      return 'rate-limited';
    case 'timeout':
      return 'timeout';
    case 'network':
      return 'network';
    case 'bad-request':
    case 'outage':
    case 'parse-error':
      return 'outage';
  }
}

/**
 * Recover a dead page: find the closest working capture, rewrite it to load
 * from the archive, account for what came back, and extract a reader view.
 * Returns a typed outcome; it never throws for an expected failure.
 *
 * When `options.timestamp` is given, Seance opens that specific capture instead
 * of the most recent working one, so the capture picker can show an older
 * version (R2.4). The "last working capture" used for the certificate is still
 * the most recent 200, regardless of which capture is shown.
 */
export async function recover(
  originalUrl: string,
  deps: RecoverDeps,
  options: RecoverOptions = {},
): Promise<RecoveryOutcome> {
  const archiveDeps: ArchiveClientDeps = { fetch: deps.fetch };
  if (deps.baseUrl !== undefined) {
    archiveDeps.baseUrl = deps.baseUrl;
  }
  if (deps.cdxCache !== undefined) {
    archiveDeps.cdxCache = deps.cdxCache;
  }

  // One deadline for the whole recovery (R8.9): its signal aborts every archive
  // fetch, so a slow or rate-limited archive cannot hold the UI open. The timer
  // is always cleared in the `finally` below.
  const deadline = (deps.createDeadline ?? defaultDeadline)(
    deps.deadlineMs ?? DEFAULT_DEADLINE_MS,
  );
  archiveDeps.signal = deadline.signal;

  try {
    return await runRecovery(originalUrl, deps, archiveDeps, options);
  } finally {
    deadline.cancel();
  }
}

/** The recovery steps, run under the deadline set up by `recover`. */
async function runRecovery(
  originalUrl: string,
  deps: RecoverDeps,
  archiveDeps: ArchiveClientDeps,
  options: RecoverOptions,
): Promise<RecoveryOutcome> {
  const notify = options.onProgress ?? (() => {});

  notify('contacting');
  const captures = await fetchCaptures(originalUrl, archiveDeps);
  if (!captures.ok) {
    return { ok: false, kind: mapClientError(captures.error.kind), detail: captures.error.message };
  }

  const selection = selectCapture(captures.value);

  // A specific capture was requested (the picker): use it if it exists.
  const requested =
    options.timestamp !== undefined
      ? selectByTimestamp(captures.value, options.timestamp)
      : null;

  const selected = requested ?? selection.best;
  if (selected === null) {
    if (selection.fallback === null) {
      return { ok: false, kind: 'no-captures' };
    }
    return { ok: false, kind: 'no-working-capture', fallbackCapture: selection.fallback };
  }

  const captureList = byDate(captures.value);
  notify('retrieving');
  const snapshot = await fetchSnapshot(selected.originalUrl, selected.timestamp, archiveDeps);
  if (!snapshot.ok) {
    return { ok: false, kind: mapClientError(snapshot.error.kind), detail: snapshot.error.message };
  }

  const ctx: RewriteContext = {
    timestamp: selected.timestamp,
    pageOriginalUrl: selected.originalUrl,
    raw: true,
  };

  // Rewrite the restored document in place and collect its assets.
  notify('rebuilding');
  const restoredDoc = deps.parseHtml(snapshot.value.body);
  const { assets } = rewriteDocument(restoredDoc, ctx);

  notify('checking');
  const lookup = createCaptureLookup(
    archiveDeps,
    deps.lookupConcurrency !== undefined ? { concurrency: deps.lookupConcurrency } : {},
  );
  const assetResults = await resolveAssetStatuses(assets, lookup, {
    maxChecked: deps.maxCheckedAssets ?? DEFAULT_MAX_CHECKED_ASSETS,
  });

  const report = buildRecoveryReport({
    selectedCapture: selected,
    lastWorkingCapture: selection.lastWorking,
    assets: assetResults,
  });

  // Apply Flash outcomes to the restored DOM before serialising: confirmed
  // -missing `.swf` embeds become a plain "not saved" notice; recovered and
  // undetermined ones stay in place for Ruffle to attempt inside the iframe
  // (design.md §9, R6.1–R6.3). The player itself is mounted by Ruffle in the
  // sandbox, not here.
  const flashStatusByUrl = new Map<string, AssetStatus>();
  for (const asset of assetResults) {
    if (asset.kind === 'flash') {
      flashStatusByUrl.set(asset.originalUrl, asset.status);
    }
  }
  const flash = applyFlashNotices(
    restoredDoc,
    (url) => flashStatusByUrl.get(url) ?? 'unknown',
  );

  const readerDeps: ReaderDeps = { parseHtml: deps.parseHtml };
  if (deps.createReadability !== undefined) {
    readerDeps.createReadability = deps.createReadability;
  }
  notify('reading');
  const reader = extractReader(snapshot.value.body, ctx, readerDeps);

  return {
    ok: true,
    view: {
      pageOriginalUrl: selected.originalUrl,
      selectedCapture: selected,
      captures: captureList,
      report,
      restoredHtml: deps.serialize(restoredDoc),
      reader,
      hasFlash: flash.playable > 0,
    },
  };
}

/**
 * One CDX cache for the whole browser session, so re-recovering a page or
 * following an internal link back to it makes no new CDX request (R8.8).
 */
const browserCdxCache = createCdxCache();

/**
 * Default recovery dependencies for the browser: real `fetch`, `DOMParser`
 * for parsing, and `XMLSerializer` for serialising the rewritten document.
 */
export function browserRecoverDeps(): RecoverDeps {
  return {
    fetch: (...args) => fetch(...args),
    cdxCache: browserCdxCache,
    parseHtml: (html) => new DOMParser().parseFromString(html, 'text/html'),
    serialize: (doc) =>
      `<!doctype html>${doc.documentElement?.outerHTML ?? new XMLSerializer().serializeToString(doc)}`,
  };
}
