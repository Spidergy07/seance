// Detect a redirect-stub page: an HTTP 200 response whose only effect is to
// send the browser elsewhere — a `<meta http-equiv="refresh">` with a URL, or a
// body-level `window.location` / `location.replace` assignment — and which
// carries essentially no real content. Such a stub can keep returning 200 for
// years after the real site is gone (a parked or "moved" placeholder), so the
// death-date logic must not treat it as the site's last working state (R2.7).
//
// Pure module: no DOM, no network. It works on the HTML string with regular
// expressions and a content-length guard, so it runs anywhere and is easy to
// test. See design.md §6.

/** A detected redirect stub and, when extractable, where it points. */
export interface RedirectStub {
  /** The redirect target, or null when it could not be extracted. */
  target: string | null;
}

/**
 * Above this many characters of visible (tag-stripped) text, a page is treated
 * as real content rather than a bare redirect stub, even if it also contains a
 * redirect directive. Redirect stubs are tiny (the NASA Kids stub is ~780
 * bytes, a few words of visible text); a real page has far more.
 */
const MAX_STUB_TEXT = 300;

/** Pull the `url=` target out of a `<meta http-equiv="refresh" content=...>`. */
function metaRefreshTarget(html: string): string | null {
  const meta =
    /<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*>/i.exec(html);
  if (meta === null) {
    return null;
  }
  const content = /content\s*=\s*["']([^"']*)["']/i.exec(meta[0]);
  if (content === null || content[1] === undefined) {
    return null;
  }
  const url = /url\s*=\s*([^"'\s;]+)/i.exec(content[1]);
  return url?.[1] ?? null;
}

/**
 * Pull the target out of a body-level JS redirect: `location = '...'`,
 * `window.location.href = '...'`, `document.location = '...'`, or
 * `location.replace('...')`. Reading a location property (e.g.
 * `document.location.pathname`) is not a redirect and does not match.
 */
function jsRedirectTarget(html: string): string | null {
  const assign =
    /(?:window\.|document\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i.exec(
      html,
    );
  if (assign?.[1] !== undefined) {
    return assign[1];
  }
  const replace =
    /(?:window\.|document\.)?location\.replace\(\s*["']([^"']+)["']/i.exec(html);
  return replace?.[1] ?? null;
}

/** The visible text of the page, with scripts, styles, comments, and tags removed. */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Classify whether `html` is a redirect stub. Returns the stub (with its target
 * when extractable) when the page carries a redirect directive AND has little
 * real content, else null. The content guard keeps a real page that merely
 * contains a redirect directive (rare) from being misclassified.
 */
export function classifyRedirectStub(html: string): RedirectStub | null {
  const target = metaRefreshTarget(html) ?? jsRedirectTarget(html);
  if (target === null) {
    return null;
  }
  if (visibleText(html).length > MAX_STUB_TEXT) {
    return null;
  }
  return { target };
}
