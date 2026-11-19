// Serverless proxy for the Wayback Machine CDX API.
//
// The browser calls our own `/api/cdx?url=<original>` endpoint; this function
// calls the archive. Routing through our origin avoids CORS and gives one
// place for timeouts, retries, and rate-limit handling (design.md §1, §11).
//
// Stateless: no database, no caching of user queries, nothing persisted
// (requirements R9.1, R9.5). No DOM, no React.

import {
  DEFAULT_RETRY_OPTIONS,
  UpstreamError,
  defaultHttpDeps,
  fetchWithRetry,
  logProxyFailure,
  statusForUpstreamError,
  type HttpDeps,
  type RetryOptions,
} from './http.js';

/** The Wayback CDX search endpoint. */
const CDX_ENDPOINT = 'https://web.archive.org/cdx/search/cdx';

/**
 * A descriptive User-Agent so the archive can identify the caller, as design.md
 * §11 asks. Plain text, no marketing.
 */
const USER_AGENT = 'Seance/0.1 (+archive recovery tool)';

/** Build the upstream CDX query URL for one original URL. */
export function buildCdxRequestUrl(originalUrl: string): string {
  const params = new URLSearchParams({
    url: originalUrl,
    output: 'json',
    // Only the fields the client needs, in a fixed order.
    fl: 'urlkey,timestamp,original,mimetype,statuscode,digest,length',
  });
  return `${CDX_ENDPOINT}?${params.toString()}`;
}

/**
 * CDX rows as the archive returns them with `output=json`: an array of string
 * arrays whose first element is a header row. An empty body means no captures.
 */
export type CdxRows = string[][];

/**
 * A short-lived in-memory cache of CDX rows, keyed by the queried original URL
 * (R8.8). It lets the proxy answer a repeated query without a new upstream
 * call, which matters under rate limiting. It is ephemeral and stores no user
 * identity, so it does not breach R9.5. Entries expire after `ttlMs`.
 */
export interface CdxMemoryCache {
  get(url: string): CdxRows | undefined;
  set(url: string, rows: CdxRows): void;
}

/** Build a TTL cache. `now` is injectable so expiry is testable offline. */
export function createCdxMemoryCache(
  ttlMs = 300_000,
  now: () => number = () => Date.now(),
): CdxMemoryCache {
  const store = new Map<string, { rows: CdxRows; expires: number }>();
  return {
    get(url) {
      const entry = store.get(url);
      if (entry === undefined) {
        return undefined;
      }
      if (entry.expires <= now()) {
        store.delete(url);
        return undefined;
      }
      return entry.rows;
    },
    set(url, rows) {
      store.set(url, { rows, expires: now() + ttlMs });
    },
  };
}

/** The proxy's process-wide cache, reused across warm invocations. */
const defaultCdxCache = createCdxMemoryCache();

/**
 * Query the CDX API for captures of `originalUrl` and return the parsed rows.
 * Throws `UpstreamError` on timeout, rate limiting, or an upstream failure.
 */
export async function fetchCdxRows(
  originalUrl: string,
  deps: HttpDeps = defaultHttpDeps(),
  options: RetryOptions = DEFAULT_RETRY_OPTIONS,
): Promise<CdxRows> {
  const url = buildCdxRequestUrl(originalUrl);
  const response = await fetchWithRetry(
    url,
    { headers: { 'user-agent': USER_AGENT, accept: 'application/json' } },
    deps,
    options,
  );

  const body = (await response.text()).trim();
  if (body === '') {
    // CDX returns an empty body when there are no matches.
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new UpstreamError(
      'server-error',
      'Upstream returned a response that was not valid JSON',
    );
  }

  if (!Array.isArray(parsed)) {
    throw new UpstreamError(
      'server-error',
      'Upstream returned JSON that was not a CDX row array',
    );
  }
  return parsed as CdxRows;
}

/** Validate the incoming `url` query parameter: an absolute http(s) URL. */
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
 * The serverless entry point. Reads `?url=`, queries CDX, returns the rows as
 * JSON. Host-agnostic: it takes a standard `Request` and returns a `Response`,
 * so it runs on Vercel/Netlify functions and Cloudflare Workers alike.
 */
export async function handleCdxRequest(
  request: Request,
  deps: HttpDeps = defaultHttpDeps(),
  options: RetryOptions = DEFAULT_RETRY_OPTIONS,
  cache: CdxMemoryCache = defaultCdxCache,
): Promise<Response> {
  const requestUrl = new URL(request.url);
  const originalUrl = validateOriginalUrl(requestUrl.searchParams.get('url'));

  if (originalUrl === null) {
    return jsonResponse(
      {
        error: 'bad-request',
        message:
          'Provide an absolute http(s) URL in the "url" query parameter.',
      },
      400,
    );
  }

  const cached = cache.get(originalUrl);
  if (cached !== undefined) {
    return jsonResponse({ rows: cached }, 200);
  }

  try {
    const rows = await fetchCdxRows(originalUrl, deps, options);
    cache.set(originalUrl, rows);
    return jsonResponse({ rows }, 200);
  } catch (error) {
    logProxyFailure('cdx', error);
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

/**
 * Deploy as a Vercel Edge Function. The handler already takes a Web `Request`
 * and returns a Web `Response`, and uses only Web-standard APIs (`fetch`,
 * `URL`, `AbortController`), so it runs on the free Edge runtime unchanged.
 */
export const config = { runtime: 'edge' };

export default handleCdxRequest;
