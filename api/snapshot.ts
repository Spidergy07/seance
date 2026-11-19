// Serverless proxy for archived snapshot bytes (HTML and assets).
//
// The browser cannot always fetch an archived resource directly: the archive's
// CORS headers and its own link-rewriting get in the way. This function fetches
// the raw snapshot (via the `id_` modifier, so the archive serves the original
// bytes un-rewritten) and relays it back from our own origin. The client then
// rewrites links itself with core/url-rewriter. See design.md §1, §3 step 4.
//
// Stateless: nothing persisted. No DOM, no React. The relayed bytes are
// untrusted; the browser renders them only inside a sandboxed iframe (R9.2).

import { buildArchiveUrl } from '../src/core/archive-url.js';
import {
  DEFAULT_RETRY_OPTIONS,
  UpstreamError,
  defaultHttpDeps,
  fetchWithRetry,
  statusForUpstreamError,
  type HttpDeps,
  type RetryOptions,
} from './http.js';

const USER_AGENT = 'Seance/0.1 (+archive recovery tool)';

/** A 14-digit Wayback timestamp. */
const TIMESTAMP_RE = /^\d{14}$/;

export interface SnapshotRequest {
  originalUrl: string;
  timestamp: string;
}

/**
 * The upstream archive URL for a snapshot. Always raw (`id_`) so we receive the
 * original bytes and do our own rewriting. Delegates the prefix format to
 * core/archive-url, the single source of truth.
 */
export function buildSnapshotRequestUrl(
  originalUrl: string,
  timestamp: string,
): string {
  return buildArchiveUrl(originalUrl, timestamp, { raw: true });
}

/**
 * Fetch the archived snapshot and return the upstream `Response` (after the
 * retry/timeout policy). Throws `UpstreamError` on failure.
 */
export async function fetchSnapshotResponse(
  req: SnapshotRequest,
  deps: HttpDeps = defaultHttpDeps(),
  options: RetryOptions = DEFAULT_RETRY_OPTIONS,
): Promise<Response> {
  const url = buildSnapshotRequestUrl(req.originalUrl, req.timestamp);
  return fetchWithRetry(
    url,
    { headers: { 'user-agent': USER_AGENT } },
    deps,
    options,
  );
}

/** Validate an absolute http(s) URL; return its normalised form or null. */
function validateOriginalUrl(raw: string | null): string | null {
  if (raw === null || raw.trim() === '') {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  return parsed.href;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * The serverless entry point. Reads `?url=` and `?timestamp=`, fetches the raw
 * snapshot, and relays the bytes with the upstream content type. Host-agnostic:
 * standard `Request` in, `Response` out.
 */
export async function handleSnapshotRequest(
  request: Request,
  deps: HttpDeps = defaultHttpDeps(),
  options: RetryOptions = DEFAULT_RETRY_OPTIONS,
): Promise<Response> {
  const requestUrl = new URL(request.url);
  const originalUrl = validateOriginalUrl(requestUrl.searchParams.get('url'));
  const timestamp = requestUrl.searchParams.get('timestamp') ?? '';

  if (originalUrl === null) {
    return jsonResponse(
      {
        error: 'bad-request',
        message: 'Provide an absolute http(s) URL in the "url" parameter.',
      },
      400,
    );
  }
  if (!TIMESTAMP_RE.test(timestamp)) {
    return jsonResponse(
      {
        error: 'bad-request',
        message: 'Provide a 14-digit Wayback timestamp in the "timestamp" parameter.',
      },
      400,
    );
  }

  try {
    const upstream = await fetchSnapshotResponse(
      { originalUrl, timestamp },
      deps,
      options,
    );
    const bytes = await upstream.arrayBuffer();
    const contentType =
      upstream.headers.get('content-type') ?? 'application/octet-stream';
    return new Response(bytes, {
      status: 200,
      headers: { 'content-type': contentType },
    });
  } catch (error) {
    if (error instanceof UpstreamError) {
      return jsonResponse(
        { error: error.kind, message: error.message },
        statusForUpstreamError(error),
      );
    }
    return jsonResponse(
      { error: 'network', message: 'Could not reach the Internet Archive.' },
      502,
    );
  }
}

export default handleSnapshotRequest;
