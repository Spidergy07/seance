// A tiny host-agnostic router over the two proxies, so one entry point can
// serve both `/api/cdx` and `/api/snapshot`. It keeps the proxies unchanged
// and gives the local dev server (Vite middleware) and any single-function
// host one place to dispatch. Standard `Request` in, `Response` out.
//
// Stateless, no DOM, no React (structure.md: api/ holds no DOM/React code).

import { handleCdxRequest } from './cdx.js';
import { handleSnapshotRequest } from './snapshot.js';
import { handleSwfRequest } from './swf.js';
import {
  DEFAULT_RETRY_OPTIONS,
  defaultHttpDeps,
  toRequestUrl,
  type HttpDeps,
  type RetryOptions,
} from './http.js';

/** The proxy paths this router serves. */
export const CDX_PATH = '/api/cdx';
export const SNAPSHOT_PATH = '/api/snapshot';
export const SWF_PATH = '/api/swf';

/**
 * Dispatch an incoming request to the matching proxy. Returns the proxy's
 * `Response`, or `null` when the path is not one of ours so a host's middleware
 * can fall through to the next handler.
 */
export async function handleApiRequest(
  request: Request,
  deps: HttpDeps = defaultHttpDeps(),
  options: RetryOptions = DEFAULT_RETRY_OPTIONS,
): Promise<Response | null> {
  const { pathname } = toRequestUrl(request);
  if (pathname === CDX_PATH) {
    return handleCdxRequest(request, deps, options);
  }
  if (pathname === SNAPSHOT_PATH) {
    return handleSnapshotRequest(request, deps, options);
  }
  if (pathname === SWF_PATH) {
    return handleSwfRequest(request, deps, options);
  }
  return null;
}
