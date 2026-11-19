// Snapshot client: fetches archived HTML/asset bytes through our own
// `/api/snapshot` proxy, never archive.org directly (requirements R9.1). The
// returned HTML is untrusted; callers render it only inside a sandboxed iframe
// (R9.2). See design.md §1, §3 step 4.

import type { ArchiveClientDeps } from './cdx-client.js';
import {
  errorFromResponse,
  errorFromThrow,
  err,
  ok,
  type ClientResult,
} from './result.js';

export interface Snapshot {
  /** The archived resource body as text (HTML for pages). */
  body: string;
  /** The content type the archive reported. */
  contentType: string;
}

/** Build the relative proxy path for a snapshot fetch. */
export function snapshotEndpoint(
  originalUrl: string,
  timestamp: string,
  baseUrl = '',
): string {
  const params = new URLSearchParams({ url: originalUrl, timestamp });
  return `${baseUrl}/api/snapshot?${params.toString()}`;
}

/**
 * Fetch one archived snapshot through our proxy. Returns the body as text and
 * the reported content type, or a typed error.
 */
export async function fetchSnapshot(
  originalUrl: string,
  timestamp: string,
  deps: ArchiveClientDeps,
): Promise<ClientResult<Snapshot>> {
  const endpoint = snapshotEndpoint(originalUrl, timestamp, deps.baseUrl ?? '');

  const init: RequestInit = {};
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

  const contentType =
    response.headers.get('content-type') ?? 'application/octet-stream';

  let body: string;
  try {
    body = await response.text();
  } catch (error) {
    return err(errorFromThrow(error));
  }

  return ok({ body, contentType });
}
