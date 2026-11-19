// Walk a parsed archived document and rewrite every resource reference so it
// resolves against the archive. This layer is DOM-dependent (it runs under
// `DOMParser` in the browser and `linkedom` in tests) but it makes no URL
// decisions itself: every URL goes through core/url-rewriter, the single
// source of truth. See design.md §7 and requirements R3.1.
//
// It also collects the assets it rewrote, so recovery accounting (task 14) can
// resolve each one to recovered/missing/unknown without walking the DOM again.
//
// Scope note (design.md §7): element attributes listed below and the URLs in
// `<style>`/inline-style CSS are rewritten for confinement. Asset *accounting*
// covers the element-level assets (images, scripts, stylesheets, media, Flash,
// frames); URLs referenced only from CSS `url(...)` are rewritten but not
// individually enumerated in the recovery report.

import {
  rewrite,
  rewriteCssUrls,
  rewriteSrcset,
  type RewriteContext,
} from '../core/url-rewriter.js';
import { parseArchiveUrl } from '../core/archive-url.js';
import type { AssetKind } from '../core/types.js';

/** A resource reference collected while rewriting, for recovery accounting. */
export interface CollectedAsset {
  /** Absolute original URL (the dead site's), recovered from the archive URL. */
  originalUrl: string;
  kind: AssetKind;
}

export interface RewriteDocumentResult {
  /** Unique element-level assets referenced by the document. */
  assets: CollectedAsset[];
}

type AttrMode = 'url' | 'srcset';

interface AttrRule {
  selector: string;
  attr: string;
  mode: AttrMode;
  /**
   * The asset kind for a collected URL, or null when the reference is a
   * navigation link (still rewritten, but not counted as an asset).
   */
  kindOf: (el: Element, originalUrl: string) => AssetKind | null;
}

/** True when a URL's path ends in `.swf` (a Flash movie). */
function isSwf(originalUrl: string): boolean {
  try {
    return new URL(originalUrl).pathname.toLowerCase().endsWith('.swf');
  } catch {
    return originalUrl.toLowerCase().split('?')[0]?.endsWith('.swf') ?? false;
  }
}

/** Kind for a `<link>` based on its `rel`. */
function linkKind(el: Element): AssetKind {
  const rel = (el.getAttribute('rel') ?? '').toLowerCase();
  if (rel.includes('stylesheet')) {
    return 'stylesheet';
  }
  if (rel.includes('icon')) {
    return 'image';
  }
  return 'other';
}

// The attribute set from design.md §7. `video[src]` is included alongside
// `audio[src]` so a direct video source is confined too (R3.4); the design
// lists the media attributes by example.
const ATTR_RULES: AttrRule[] = [
  { selector: 'a[href]', attr: 'href', mode: 'url', kindOf: () => null },
  { selector: 'link[href]', attr: 'href', mode: 'url', kindOf: (el) => linkKind(el) },
  { selector: 'script[src]', attr: 'src', mode: 'url', kindOf: () => 'script' },
  { selector: 'img[src]', attr: 'src', mode: 'url', kindOf: () => 'image' },
  { selector: 'img[srcset]', attr: 'srcset', mode: 'srcset', kindOf: () => 'image' },
  { selector: 'source[srcset]', attr: 'srcset', mode: 'srcset', kindOf: () => 'image' },
  { selector: 'source[src]', attr: 'src', mode: 'url', kindOf: () => 'media' },
  { selector: 'video[poster]', attr: 'poster', mode: 'url', kindOf: () => 'image' },
  { selector: 'video[src]', attr: 'src', mode: 'url', kindOf: () => 'media' },
  { selector: 'audio[src]', attr: 'src', mode: 'url', kindOf: () => 'media' },
  { selector: 'iframe[src]', attr: 'src', mode: 'url', kindOf: () => 'other' },
  {
    selector: 'object[data]',
    attr: 'data',
    mode: 'url',
    kindOf: (_el, url) => (isSwf(url) ? 'flash' : 'other'),
  },
  {
    selector: 'embed[src]',
    attr: 'src',
    mode: 'url',
    kindOf: (_el, url) => (isSwf(url) ? 'flash' : 'other'),
  },
];

/** The URL part of each `srcset` candidate (descriptors dropped). */
function srcsetUrls(srcset: string): string[] {
  return srcset
    .split(',')
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate !== '')
    .map((candidate) => {
      const space = candidate.search(/\s/);
      return space === -1 ? candidate : candidate.slice(0, space);
    });
}

/**
 * Recover the absolute original URL a reference resolves to, by rewriting it
 * and reading the original back out of the archive URL. Returns null for
 * references the rewriter leaves alone (empty, pure fragment, `mailto:`, ...),
 * which are therefore not assets.
 */
function resolvedOriginal(ref: string, ctx: RewriteContext): string | null {
  const rewritten = rewrite(ref, ctx);
  const parsed = parseArchiveUrl(rewritten);
  return parsed ? parsed.originalUrl : null;
}

/**
 * Remove every `<base>` element so it cannot redirect the browser's own
 * resolution off the archive when the restored page renders (design.md §7).
 */
function neutraliseBase(doc: Document): void {
  for (const base of Array.from(doc.querySelectorAll('base'))) {
    base.remove();
  }
}

/**
 * Rewrite all resource references in `doc` in place and return the element-level
 * assets it referenced (de-duplicated by original URL).
 */
export function rewriteDocument(
  doc: Document,
  ctx: RewriteContext,
): RewriteDocumentResult {
  neutraliseBase(doc);

  const assetsByUrl = new Map<string, CollectedAsset>();
  const record = (originalUrl: string | null, kind: AssetKind | null): void => {
    if (originalUrl === null || kind === null) {
      return;
    }
    if (!assetsByUrl.has(originalUrl)) {
      assetsByUrl.set(originalUrl, { originalUrl, kind });
    }
  };

  for (const rule of ATTR_RULES) {
    for (const el of Array.from(doc.querySelectorAll(rule.selector))) {
      const value = el.getAttribute(rule.attr);
      if (value === null) {
        continue;
      }

      if (rule.mode === 'srcset') {
        el.setAttribute(rule.attr, rewriteSrcset(value, ctx));
        for (const url of srcsetUrls(value)) {
          const original = resolvedOriginal(url, ctx);
          record(original, original ? rule.kindOf(el, original) : null);
        }
      } else {
        el.setAttribute(rule.attr, rewrite(value, ctx));
        const original = resolvedOriginal(value, ctx);
        record(original, original ? rule.kindOf(el, original) : null);
      }
    }
  }

  // Inline style attributes and <style> text: rewrite url(...) for confinement.
  for (const el of Array.from(doc.querySelectorAll('[style]'))) {
    const style = el.getAttribute('style');
    if (style !== null && style !== '') {
      el.setAttribute('style', rewriteCssUrls(style, ctx));
    }
  }
  for (const el of Array.from(doc.querySelectorAll('style'))) {
    el.textContent = rewriteCssUrls(el.textContent ?? '', ctx);
  }

  return { assets: Array.from(assetsByUrl.values()) };
}
