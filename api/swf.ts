// Serverless proxy for archived Flash (`.swf`) bytes, with CORS.
//
// The restored page renders in a sandboxed, opaque-origin iframe. Ruffle there
// fetches the archived `.swf`, but web.archive.org sends no CORS headers for
// the raw (`id_`) bytes, so the browser blocks the cross-origin fetch. This
// function relays the bytes from our own origin with
// `Access-Control-Allow-Origin: *`, so Ruffle can load them (R6.6, design.md
// §9.1).
//
// Safety: it fetches ONLY from web.archive.org and rejects any other host, so
// it is not an open proxy. Stateless, nothing persisted. No DOM, no React. The
// relayed bytes are untrusted and only ever run inside Ruffle's sandbox.

import {
  DEFAULT_RETRY_OPTIONS,
  SEANCE_USER_AGENT,
  UpstreamError,
  defaultHttpDeps,
  fetchWithRetry,
  logProxyFailure,
  statusForUpstreamError,
  toRequestUrl,
  type HttpDeps,
  type RetryOptions,
} from './http.js';
import { ARCHIVE_HOST } from '../src/core/archive-url.js';

const USER_AGENT = SEANCE_USER_AGENT;

/** Default content type when the upstream response omits one. */
const SWF_CONTENT_TYPE = 'application/x-shockwave-flash';

/**
 * Validate the `url` parameter: an absolute http(s) URL whose host is exactly
 * the archive. Returns the URL to fetch, or null to reject. The host check is
 * what prevents the endpoint from being used as an open proxy (R6.6).
 */
function validateArchiveUrl(raw: string | null): string | null {
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
  if (parsed.host !== ARCHIVE_HOST) {
    return null;
  }
  return parsed.href;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
    },
  });
}

/**
 * The serverless entry point. Reads `?url=` (an archive `.swf` URL), fetches
 * the bytes from web.archive.org, and relays them with a CORS header and a
 * Flash content type. Host-agnostic: standard `Request` in, `Response` out.
 */
export async function handleSwfRequest(
  request: Request,
  deps: HttpDeps = defaultHttpDeps(),
  options: RetryOptions = DEFAULT_RETRY_OPTIONS,
): Promise<Response> {
  const requestUrl = toRequestUrl(request);
  const archiveUrl = validateArchiveUrl(requestUrl.searchParams.get('url'));

  if (archiveUrl === null) {
    return jsonResponse(
      {
        error: 'bad-request',
        message:
          'Provide an archive.org .swf URL in the "url" parameter. Only web.archive.org is allowed.',
      },
      400,
    );
  }

  try {
    const upstream = await fetchWithRetry(
      archiveUrl,
      { headers: { 'user-agent': USER_AGENT } },
      deps,
      options,
    );
    const bytes = await upstream.arrayBuffer();
    // The archive serves raw (id_) bytes as a generic octet-stream. Give Ruffle
    // a correct Flash content type in that case; keep a specific upstream type
    // (e.g. an error page's text/html) when the archive provides one.
    const upstreamType = upstream.headers.get('content-type');
    const contentType =
      upstreamType === null || upstreamType === 'application/octet-stream'
        ? SWF_CONTENT_TYPE
        : upstreamType;
    return new Response(bytes, {
      status: 200,
      headers: {
        'content-type': contentType,
        'access-control-allow-origin': '*',
      },
    });
  } catch (error) {
    logProxyFailure('swf', error);
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

/** Deploy on Vercel's default Node.js serverless runtime, like the others. */
export const config = { maxDuration: 30 };

/** Named GET export so Vercel's Node.js runtime uses the Web handler (see cdx.ts). */
export function GET(request: Request): Promise<Response> {
  return handleSwfRequest(request);
}
