// CDX client: the browser's only way to ask for captures. It calls our own
// `/api/cdx` proxy, never archive.org directly (requirements R9.1, design.md
// §1, §3 step 2). It parses the proxy's rows into `Capture`s with the pure
// core parser and returns a typed result.

import { parseCdxRows, type CdxRow } from '../core/capture-select.js';
import type { Capture } from '../core/types.js';
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
  const endpoint = cdxEndpoint(originalUrl, deps.baseUrl ?? '');

  let response: Response;
  try {
    response = await deps.fetch(endpoint, {
      headers: { accept: 'application/json' },
    });
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

  return ok(parseCdxRows(body.rows as CdxRow[]));
}
