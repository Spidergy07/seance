// The logic behind the Wayback MCP server's three tools. Kept separate from the
// MCP wiring (index.ts) so it can be tested with a mocked fetch and so it does
// not pull the MCP SDK into the test graph.
//
// It reuses Seance's own code: the pure CDX parsing and archive-URL building in
// `src/core`, and the timeout/retry/rate-limit helper in `api/http.ts`, so the
// server treats the archive with the same care the app does. All archive
// traffic goes to web.archive.org only; nothing is persisted.

import { parseHTML } from 'linkedom';
import {
  DEFAULT_RETRY_OPTIONS,
  defaultHttpDeps,
  fetchWithRetry,
  type HttpDeps,
  type RetryOptions,
} from '../../../api/http.js';
import { parseCdxRows, byDate } from '../../../src/core/capture-select.js';
import { buildArchiveUrl } from '../../../src/core/archive-url.js';
import { detectFlashRefs } from '../../../src/dom/flash.js';
import type { Capture } from '../../../src/core/types.js';

/** The Wayback CDX search endpoint (the one and only query host). */
const CDX_ENDPOINT = 'https://web.archive.org/cdx/search/cdx';

/** A descriptive User-Agent, matching the app's proxy (design.md §11). */
const USER_AGENT = 'Seance-Wayback-MCP/0.1 (+archive recovery tool)';

/** Shared dependencies: the HTTP helper's side effects and the retry policy. */
export interface WaybackDeps {
  http?: HttpDeps;
  retry?: RetryOptions;
}

function httpOf(deps: WaybackDeps): HttpDeps {
  return deps.http ?? defaultHttpDeps();
}
function retryOf(deps: WaybackDeps): RetryOptions {
  return deps.retry ?? DEFAULT_RETRY_OPTIONS;
}

/** Validate a subject URL: an absolute http(s) URL. Returns null if not. */
function validHttpUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    ? parsed.href
    : null;
}

/** Fetch and parse a CDX query into captures. Throws `UpstreamError` on failure. */
async function fetchCaptures(
  searchUrl: string,
  deps: WaybackDeps,
): Promise<Capture[]> {
  const response = await fetchWithRetry(
    searchUrl,
    { headers: { 'user-agent': USER_AGENT, accept: 'application/json' } },
    httpOf(deps),
    retryOf(deps),
  );
  const body = (await response.text()).trim();
  if (body === '') {
    return [];
  }
  const parsed: unknown = JSON.parse(body);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parseCdxRows(parsed as string[][]);
}

/**
 * Collapse captures to one per calendar day, preferring a working (status-200)
 * capture for the day and otherwise the most recent of any status. Newest day
 * first. Mirrors the app's picker rule (R2.6) without depending on the UI.
 */
function collapseByDay(captures: readonly Capture[]): Capture[] {
  const ordered = byDate(captures); // newest first, de-duplicated by timestamp
  const chosen = new Map<string, Capture>();
  for (const capture of ordered) {
    const day = capture.timestamp.slice(0, 8);
    const current = chosen.get(day);
    if (current === undefined) {
      chosen.set(day, capture);
    } else if (current.statusCode !== 200 && capture.statusCode === 200) {
      chosen.set(day, capture);
    }
  }
  return [...chosen.values()];
}

/** One capture as the tools report it: plain fields plus a browsable archive URL. */
export interface CaptureInfo {
  timestamp: string;
  originalUrl: string;
  statusCode: number;
  mimeType: string;
  /** A browsable Wayback replay URL for this capture. */
  archiveUrl: string;
}

function toInfo(capture: Capture): CaptureInfo {
  return {
    timestamp: capture.timestamp,
    originalUrl: capture.originalUrl,
    statusCode: capture.statusCode,
    mimeType: capture.mimeType,
    archiveUrl: buildArchiveUrl(capture.originalUrl, capture.timestamp),
  };
}

// --- cdx_search ------------------------------------------------------------

export interface CdxSearchParams {
  url: string;
  /** Inclusive lower bound, a Wayback timestamp prefix (e.g. "1998" or "20040101"). */
  from?: string;
  /** Inclusive upper bound, a Wayback timestamp prefix. */
  to?: string;
  /** Cap on rows the archive returns (default 200). */
  limit?: number;
  /** Keep only status-200 captures (default true). */
  onlyWorking?: boolean;
  /** Collapse to one capture per calendar day (default true). */
  collapseDaily?: boolean;
}

export interface CdxSearchResult {
  url: string;
  count: number;
  captures: CaptureInfo[];
}

/**
 * Search the Wayback CDX index for captures of a URL. By default it keeps only
 * working (status-200) captures and collapses them to one per day, so the
 * result is the set of distinct days the page was saved and working.
 */
export async function cdxSearch(
  params: CdxSearchParams,
  deps: WaybackDeps = {},
): Promise<CdxSearchResult> {
  const url = validHttpUrl(params.url);
  if (url === null) {
    throw new Error('cdx_search needs an absolute http(s) url.');
  }
  const onlyWorking = params.onlyWorking ?? true;
  const collapseDaily = params.collapseDaily ?? true;

  const query = new URLSearchParams({
    url,
    output: 'json',
    fl: 'urlkey,timestamp,original,mimetype,statuscode,digest,length',
    limit: String(params.limit ?? 200),
  });
  if (params.from !== undefined && params.from !== '') {
    query.set('from', params.from);
  }
  if (params.to !== undefined && params.to !== '') {
    query.set('to', params.to);
  }
  if (onlyWorking) {
    query.set('filter', 'statuscode:200');
  }

  let captures = await fetchCaptures(`${CDX_ENDPOINT}?${query.toString()}`, deps);
  if (collapseDaily) {
    captures = collapseByDay(captures);
  } else {
    captures = byDate(captures);
  }
  return { url, count: captures.length, captures: captures.map(toInfo) };
}

// --- check_capture ---------------------------------------------------------

export interface CheckCaptureParams {
  url: string;
  /** The 14-digit Wayback timestamp to check. */
  timestamp: string;
}

export interface CheckCaptureResult {
  url: string;
  requestedTimestamp: string;
  /** The matching capture, exact or the closest one by time, or null if none. */
  capture: CaptureInfo | null;
  /** True when the match is the exact timestamp requested. */
  exact: boolean;
}

/**
 * Report the archived status of one capture: the capture at the exact
 * timestamp when it exists, else the closest one by time, so a caller learns
 * whether that moment was saved and what status it returned.
 */
export async function checkCapture(
  params: CheckCaptureParams,
  deps: WaybackDeps = {},
): Promise<CheckCaptureResult> {
  const url = validHttpUrl(params.url);
  if (url === null) {
    throw new Error('check_capture needs an absolute http(s) url.');
  }
  if (!/^\d{14}$/.test(params.timestamp)) {
    throw new Error('check_capture needs a 14-digit Wayback timestamp.');
  }

  const day = params.timestamp.slice(0, 8);
  const query = new URLSearchParams({
    url,
    output: 'json',
    fl: 'urlkey,timestamp,original,mimetype,statuscode,digest,length',
    from: day,
    to: day,
    limit: '100',
  });
  const captures = await fetchCaptures(`${CDX_ENDPOINT}?${query.toString()}`, deps);

  if (captures.length === 0) {
    return { url, requestedTimestamp: params.timestamp, capture: null, exact: false };
  }
  const exactMatch = captures.find((c) => c.timestamp === params.timestamp);
  if (exactMatch !== undefined) {
    return { url, requestedTimestamp: params.timestamp, capture: toInfo(exactMatch), exact: true };
  }
  const target = Number(params.timestamp);
  let closest = captures[0] as Capture;
  for (const capture of captures) {
    if (
      Math.abs(Number(capture.timestamp) - target) <
      Math.abs(Number(closest.timestamp) - target)
    ) {
      closest = capture;
    }
  }
  return { url, requestedTimestamp: params.timestamp, capture: toInfo(closest), exact: false };
}

// --- find_swf --------------------------------------------------------------

export interface FindSwfParams {
  url: string;
  /** Four-digit year to look within (e.g. "2004"). Optional. */
  year?: string;
}

export interface FoundSwf {
  originalUrl: string;
  /** Raw (`id_`) archive URL of the `.swf` at the page's capture timestamp. */
  archiveUrl: string;
}

export interface FindSwfResult {
  url: string;
  /** The capture whose HTML was scanned, or null when none was found. */
  capture: CaptureInfo | null;
  swf: FoundSwf[];
  message: string;
}

/** Scan a parsed document for `.swf` references: embeds, objects, params, links. */
function collectSwf(doc: Document, pageUrl: string, timestamp: string): FoundSwf[] {
  const found = new Map<string, FoundSwf>();
  const add = (raw: string): void => {
    const value = raw.trim();
    if (value === '') {
      return;
    }
    let abs: string;
    try {
      abs = new URL(value, pageUrl).href;
    } catch {
      return;
    }
    if (!abs.toLowerCase().split('?')[0]?.endsWith('.swf')) {
      return;
    }
    if (!found.has(abs)) {
      found.set(abs, {
        originalUrl: abs,
        archiveUrl: buildArchiveUrl(abs, timestamp, { raw: true }),
      });
    }
  };

  for (const ref of detectFlashRefs(doc)) {
    add(ref.originalUrl);
  }
  for (const param of Array.from(doc.querySelectorAll('param'))) {
    const name = (param.getAttribute('name') ?? '').toLowerCase();
    if (name === 'movie' || name === 'src') {
      add(param.getAttribute('value') ?? '');
    }
  }
  return [...found.values()];
}

/**
 * List the archived `.swf` files a capture of `url` references. It picks the
 * most recent working capture (within `year` when given), fetches that page's
 * HTML from the archive, and scans it for Flash references. Two archive
 * requests: one CDX query and one page fetch.
 */
export async function findSwf(
  params: FindSwfParams,
  deps: WaybackDeps = {},
): Promise<FindSwfResult> {
  const url = validHttpUrl(params.url);
  if (url === null) {
    throw new Error('find_swf needs an absolute http(s) url.');
  }

  const search: CdxSearchParams = { url, onlyWorking: true, collapseDaily: true, limit: 500 };
  if (params.year !== undefined && /^\d{4}$/.test(params.year)) {
    search.from = params.year;
    search.to = params.year;
  }
  const found = await cdxSearch(search, deps);
  const capture = found.captures[0] ?? null; // newest working capture in range
  if (capture === null) {
    return {
      url,
      capture: null,
      swf: [],
      message: params.year
        ? `No working capture of ${url} found in ${params.year}.`
        : `No working capture of ${url} found.`,
    };
  }

  // Fetch the page's archived HTML (raw bytes) and scan it for .swf references.
  const rawUrl = buildArchiveUrl(capture.originalUrl, capture.timestamp, { raw: true });
  const response = await fetchWithRetry(
    rawUrl,
    { headers: { 'user-agent': USER_AGENT } },
    httpOf(deps),
    retryOf(deps),
  );
  const html = await response.text();
  const { document } = parseHTML(html);
  const swf = collectSwf(document as unknown as Document, capture.originalUrl, capture.timestamp);

  return {
    url,
    capture,
    swf,
    message:
      swf.length === 0
        ? `No .swf references found in the ${capture.timestamp.slice(0, 8)} capture.`
        : `Found ${swf.length} .swf reference(s) in the ${capture.timestamp.slice(0, 8)} capture.`,
  };
}
