// The same-origin `.swf` CORS proxy URL: builder, parser, and guard. Pure
// module (no DOM, no network).
//
// Ruffle plays archived Flash inside the restored iframe, which runs in an
// opaque origin (srcdoc + sandbox without allow-same-origin). The archive does
// not send CORS headers for raw `.swf` bytes, so Ruffle's cross-origin fetch of
// the archive URL is blocked. Seance instead serves the bytes through its own
// endpoint (`api/swf.ts`), which sets `Access-Control-Allow-Origin: *`. This
// module turns an archive `.swf` URL into that endpoint's URL and back.
//
// Confinement (R3.4 / design.md §4.3 I2) is preserved: the proxy URL's `url`
// parameter is always an archive URL, and the proxy itself fetches only from
// web.archive.org, so no reference escapes to the live web. See design.md §9.1.

import { isArchiveUrl } from './archive-url.js';

/** The proxy path, mirrored by the dev router and the serverless function. */
export const SWF_PROXY_PATH = '/api/swf';

/**
 * Wrap an archive `.swf` URL as an absolute proxy URL on the app's own origin.
 * `proxyBase` is an absolute URL naming the endpoint (origin + `/api/swf`); an
 * absolute URL is required because a relative one cannot be resolved from the
 * opaque-origin srcdoc the restored page runs in (design.md §9.1).
 */
export function buildSwfProxyUrl(archiveUrl: string, proxyBase: string): string {
  const url = new URL(proxyBase);
  url.searchParams.set('url', archiveUrl);
  return url.href;
}

/**
 * Recover the archive URL from a proxy URL, or return null when the string is
 * not one of our proxy URLs or its target is not an archive URL. The archive
 * -URL check is what keeps the parser (and the confinement check that uses it)
 * from treating an arbitrary redirect as confined.
 */
export function parseSwfProxyUrl(proxyUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(proxyUrl);
  } catch {
    return null;
  }
  if (url.pathname !== SWF_PROXY_PATH) {
    return null;
  }
  const target = url.searchParams.get('url');
  if (target === null || !isArchiveUrl(target)) {
    return null;
  }
  return target;
}

/** True when a value is one of our proxy URLs pointing at an archive `.swf`. */
export function isSwfProxyUrl(value: string): boolean {
  return parseSwfProxyUrl(value) !== null;
}
