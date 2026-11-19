// Route recovered `.swf` embeds through the same-origin CORS proxy, so Ruffle
// (running in the opaque-origin restored iframe) can fetch the bytes. See
// design.md §9.1 and R6.6.
//
// This runs in the recovery pipeline AFTER the document rewrite (so `.swf`
// references are already archive URLs) and AFTER applyFlashNotices (so
// confirmed-missing embeds are already plain notices). It only wraps values
// that are archive `.swf` URLs; everything else is left untouched. The DOM
// layer makes no URL decisions itself — it delegates the proxy URL to
// core/swf-proxy, the single source of truth.

import { parseArchiveUrl } from '../core/archive-url.js';
import { buildSwfProxyUrl } from '../core/swf-proxy.js';

/** True when a value is an archive URL whose original resource is a `.swf`. */
function isArchiveSwf(value: string): boolean {
  const parsed = parseArchiveUrl(value.trim());
  if (parsed === null) {
    return false;
  }
  const original = parsed.originalUrl;
  try {
    return new URL(original).pathname.toLowerCase().endsWith('.swf');
  } catch {
    return original.toLowerCase().split('?')[0]?.endsWith('.swf') ?? false;
  }
}

/** Rewrite one attribute to the proxy URL if it holds an archive `.swf`. */
function routeAttr(el: Element, attr: string, proxyBase: string): boolean {
  const value = el.getAttribute(attr);
  if (value === null || !isArchiveSwf(value)) {
    return false;
  }
  el.setAttribute(attr, buildSwfProxyUrl(value, proxyBase));
  return true;
}

/**
 * Rewrite every archive `.swf` reference (`object[data]`, `embed[src]`, and
 * `param[name=movie|src]`) to the same-origin proxy URL at `proxyBase` (an
 * absolute app-origin URL for `/api/swf`). Returns how many references were
 * rewritten.
 */
export function rewriteSwfToProxy(doc: Document, proxyBase: string): number {
  let count = 0;

  for (const el of Array.from(doc.querySelectorAll('object[data]'))) {
    if (routeAttr(el, 'data', proxyBase)) {
      count += 1;
    }
  }
  for (const el of Array.from(doc.querySelectorAll('embed[src]'))) {
    if (routeAttr(el, 'src', proxyBase)) {
      count += 1;
    }
  }
  for (const param of Array.from(doc.querySelectorAll('param'))) {
    const name = (param.getAttribute('name') ?? '').toLowerCase();
    if (name !== 'movie' && name !== 'src') {
      continue;
    }
    if (routeAttr(param, 'value', proxyBase)) {
      count += 1;
    }
  }

  return count;
}
