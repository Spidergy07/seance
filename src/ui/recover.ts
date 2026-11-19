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
import { fetchSnapshot } from '../archive/snapshot-client.js';
import { createCaptureLookup } from '../archive/capture-lookup.js';
import type { ClientErrorKind } from '../archive/result.js';
import { selectCapture, selectByTimestamp, byDate } from '../core/capture-select.js';
import { buildRecoveryReport } from '../core/recovery.js';
import { rewriteDocument } from '../dom/rewrite-document.js';
import { resolveAssetStatuses } from '../dom/asset-status.js';
import { applyFlashNotices } from '../dom/flash.js';
import { extractReader } from '../dom/reader.js';
import type { ReaderDeps } from '../dom/reader.js';
import type { AssetStatus } from '../core/types.js';
import type { RewriteContext } from '../core/url-rewriter.js';
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
}

/** Options for a single recovery run. */
export interface RecoverOptions {
  /**
   * Open this exact capture (14-digit Wayback timestamp) instead of the most
   * recent working one. Used by the capture picker (R2.4). Ignored when no
   * capture has that timestamp.
   */
  timestamp?: string;
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
  const restoredDoc = deps.parseHtml(snapshot.value.body);
  const { assets } = rewriteDocument(restoredDoc, ctx);

  const lookup = createCaptureLookup(
    archiveDeps,
    deps.lookupConcurrency !== undefined ? { concurrency: deps.lookupConcurrency } : {},
  );
  const assetResults = await resolveAssetStatuses(assets, lookup);

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
 * Default recovery dependencies for the browser: real `fetch`, `DOMParser`
 * for parsing, and `XMLSerializer` for serialising the rewritten document.
 */
export function browserRecoverDeps(): RecoverDeps {
  return {
    fetch: (...args) => fetch(...args),
    parseHtml: (html) => new DOMParser().parseFromString(html, 'text/html'),
    serialize: (doc) =>
      `<!doctype html>${doc.documentElement?.outerHTML ?? new XMLSerializer().serializeToString(doc)}`,
  };
}
