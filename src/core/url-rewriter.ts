// The link/asset rewriter. Correctness-critical and pure: no DOM, no network.
// It turns a reference found in archived HTML into a URL that resolves against
// the archive, and it is the only place that decides a resource's final URL.
//
// Algorithm and invariants: design.md §4.2 and §4.3. Requirements R3.1–R3.6.

import { buildArchiveUrl, parseArchiveUrl } from './archive-url.js';

export interface RewriteContext {
  /** Selected capture timestamp (14 digits). */
  timestamp: string;
  /** Absolute URL of the captured page; the base for resolving relatives. */
  pageOriginalUrl: string;
  /** Use the `id_` raw modifier. Defaults to true (we re-fetch raw bytes). */
  raw?: boolean;
}

/**
 * Schemes that do not address a fetchable resource. They are returned
 * untouched so the rewriter never turns a `mailto:` or `javascript:` into an
 * archive link. See design.md §4.2 step 2 (R3.6).
 */
const NON_RESOLVABLE_SCHEMES = new Set([
  'mailto',
  'tel',
  'javascript',
  'data',
  'blob',
  'about',
]);

/** Leading `scheme:` of a reference, if present. */
const SCHEME_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

/**
 * Rewrite a single reference so it resolves against the archive.
 *
 * Pure and total: any input returns a string. Unresolvable or special inputs
 * (empty, pure fragment, non-resolvable scheme, unparseable) are returned
 * unchanged; everything else becomes an archive URL at `ctx.timestamp`.
 */
export function rewrite(ref: string, ctx: RewriteContext): string {
  const trimmed = ref.trim();

  // Empty reference: nothing to resolve.
  if (trimmed === '') {
    return ref;
  }

  // Pure fragment stays local to the archived document (R3.3).
  if (trimmed.startsWith('#')) {
    return ref;
  }

  // Non-resolvable schemes pass through untouched (R3.6).
  const schemeMatch = SCHEME_RE.exec(trimmed);
  if (schemeMatch) {
    const scheme = (schemeMatch[1] ?? '').toLowerCase();
    if (NON_RESOLVABLE_SCHEMES.has(scheme)) {
      return ref;
    }
  }

  // If the reference is already an archive URL, rewrite from its embedded
  // original. This makes a second pass a no-op (idempotence, R3.5) and
  // re-points the timestamp to ctx.timestamp (timestamp fidelity).
  const parsed = parseArchiveUrl(trimmed);
  const target = parsed ? parsed.originalUrl : trimmed;

  // Resolve to an absolute original URL using the WHATWG URL API. This
  // preserves query and fragment (R3.2, R3.3) and handles relative,
  // root-relative, and protocol-relative references. If it cannot be resolved,
  // leave the reference unchanged rather than emit something wrong.
  let absolute: string;
  try {
    absolute = new URL(target, ctx.pageOriginalUrl).href;
  } catch {
    return ref;
  }

  const raw = ctx.raw ?? true;
  return buildArchiveUrl(absolute, ctx.timestamp, { raw });
}

/**
 * Rewrite every URL in a `srcset` value, preserving commas, whitespace, and
 * descriptors (e.g. `2x`, `640w`) verbatim. Each candidate's URL goes through
 * `rewrite`; the descriptor is untouched. See design.md §4.4.
 *
 * Note: a candidate whose URL is a `data:` URI containing commas is not
 * supported (commas split candidates). Such URLs are rare in `srcset` and are
 * left to the caller to avoid.
 */
export function rewriteSrcset(srcset: string, ctx: RewriteContext): string {
  if (srcset.trim() === '') {
    return srcset;
  }
  return srcset
    .split(',')
    .map((candidate) => {
      const leading = candidate.slice(
        0,
        candidate.length - candidate.trimStart().length,
      );
      const trailing = candidate.slice(candidate.trimEnd().length);
      const trimmed = candidate.trim();
      if (trimmed === '') {
        return candidate;
      }
      // The URL runs up to the first whitespace; the rest is the descriptor.
      const spaceIndex = trimmed.search(/\s/);
      const url = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
      const descriptor = spaceIndex === -1 ? '' : trimmed.slice(spaceIndex);
      return `${leading}${rewrite(url, ctx)}${descriptor}${trailing}`;
    })
    .join(',');
}

/** Matches a CSS `url(...)` token, capturing the optional quote and the URL. */
const CSS_URL_RE = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi;

/**
 * Rewrite every `url(...)` in a CSS string (stylesheet text or an inline
 * `style` attribute value), preserving the original quoting style. Each inner
 * URL goes through `rewrite`, so non-resolvable schemes such as `data:` are
 * left untouched. See design.md §4.4.
 */
export function rewriteCssUrls(css: string, ctx: RewriteContext): string {
  return css.replace(CSS_URL_RE, (_match, quote: string, inner: string) => {
    return `url(${quote}${rewrite(inner, ctx)}${quote})`;
  });
}
