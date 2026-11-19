// CDX client: the browser's only way to ask for captures. It calls our own
// `/api/cdx` proxy, never archive.org directly (requirements R9.1, design.md
// §1, §3 step 2). It parses the proxy's rows into `Capture`s with the pure
// core parser and returns a typed result.

import { parseCdxRows, type CdxRow } from '../core/capture-select.js';
import type { Capture } from '../core/types.js';
import type { CdxCache } from './cdx-cache.js';
import {
  errorFromResponse,
  errorFromThrow,
  err,
  ok,
  type ClientResult,
} from './result.js';

export interface ArchiveClientDeps {
  fetch: typeof fetch;
  /**
   * Origin for the proxy. Default is empty, so requests go to our own origin
   * via a relative path. Tests set this to assert the client never calls
   * archive.org.
   */
  baseUrl?: string;
  /**
   * A session cache of CDX answers (R8.8). When present, a repeated lookup of
   * the same URL is served from it with no new request. Only successful
   * lookups are cached, so a transient failure can still be retried.
   */
  cdxCache?: CdxCache;
  /**
   * The recovery's deadline signal (R8.9). When present it is passed to every
   * fetch, so the overall deadline can abort an in-flight request.
   */
  signal?: AbortSignal;
}

/** The proxy's success body for CDX. */
interface CdxResponseBody {
  rows?: unknown;
}

/** Build the relative proxy path for a CDX query. */
export function cdxEndpoint(originalUrl: string, baseUrl = ''): string {
  const params = new URLSearchParams({ url: originalUrl });
  return `${baseUrl}/api/cdx?${params.toString()}`;
}

/**
 * Fetch captures of `originalUrl` through our proxy. Returns a typed result:
 * the parsed captures on success, or a `ClientError` the UI can explain.
 */
export async function fetchCaptures(
  originalUrl: string,
  deps: ArchiveClientDeps,
): Promise<ClientResult<Capture[]>> {
  const cache = deps.cdxCache;
  if (cache !== undefined) {
    const cached = cache.get(originalUrl);
    if (cached !== undefined) {
      return ok(cached);
    }
  }

  const endpoint = cdxEndpoint(originalUrl, deps.baseUrl ?? '');

  const init: RequestInit = { headers: { accept: 'application/json' } };
  if (deps.signal !== undefined) {
    init.signal = deps.signal;
  }

  let response: Response;
  try {
    response = await deps.fetch(endpoint, init);
  } catch (error) {
    return err(errorFromThrow(error));
  }

  if (!response.ok) {
    return err(await errorFromResponse(response));
  }

  let body: CdxResponseBody;
  try {
    body = (await response.json()) as CdxResponseBody;
  } catch {
    return err({
      kind: 'parse-error',
      message: 'The archive service returned a response we could not read.',
    });
  }

  if (!Array.isArray(body.rows)) {
    return err({
      kind: 'parse-error',
      message: 'The archive service returned captures in an unexpected shape.',
    });
  }

  const captures = parseCdxRows(body.rows as CdxRow[]);
  if (cache !== undefined) {
    cache.set(originalUrl, captures);
  }
  return ok(captures);
}
