// Pure helpers for the Restored pane: the iframe sandbox policy, the click
// interceptor injected into the archived document, and the parser for the
// messages it posts back. Kept out of the component so the trust boundary and
// the link-interception protocol are tested directly. See requirements R3.7,
// R3.8, R9.2 and design.md §8.

import { parseArchiveUrl } from '../core/archive-url.js';

/**
 * The iframe sandbox policy. `allow-scripts` lets Ruffle and our click
 * interceptor run; the absence of `allow-same-origin` keeps the archived
 * document in an opaque origin, so it cannot read the Seance app, our cookies,
 * or the user's archive session (R3.7, R9.2). Top-level navigation and form
 * submission are denied by leaving their tokens out (design.md §8).
 */
export const RESTORED_SANDBOX = 'allow-scripts';

/**
 * A tiny, dependency-free script injected into the archived document. It
 * intercepts clicks on links, stops the in-frame navigation, and posts the
 * link's (already archive-rewritten) href to the shell so it can re-run the
 * recovery flow for that page instead of loading the live web (R3.8). It runs
 * in the sandboxed opaque origin, so it can only talk to the shell by message.
 */
const INTERCEPTOR_SCRIPT =
  '<script>(function(){' +
  'function find(n){while(n){if(n.tagName&&n.tagName.toLowerCase()==="a"&&n.getAttribute("href"))return n;n=n.parentNode;}return null;}' +
  'document.addEventListener("click",function(e){' +
  'var a=find(e.target);if(!a)return;' +
  'e.preventDefault();' +
  'parent.postMessage({source:"seance-restored",type:"navigate",href:a.getAttribute("href")},"*");' +
  '},true);' +
  '})();</script>';

/**
 * Inject the click interceptor into a full HTML document string, before
 * `</body>` when present (falling back to `</html>`, then append). The script
 * is added last so it does not depend on load order.
 */
export function buildRestoredSrcDoc(html: string): string {
  const body = /<\/body>/i;
  if (body.test(html)) {
    return html.replace(body, `${INTERCEPTOR_SCRIPT}</body>`);
  }
  const htmlEnd = /<\/html>/i;
  if (htmlEnd.test(html)) {
    return html.replace(htmlEnd, `${INTERCEPTOR_SCRIPT}</html>`);
  }
  return html + INTERCEPTOR_SCRIPT;
}

/** A parsed "follow this link" message from the restored iframe. */
export interface RestoredNavigate {
  type: 'navigate';
  /** The original (dead-site) URL to re-recover, pulled from the archive URL. */
  originalUrl: string;
}

/**
 * Validate and parse a `postMessage` payload from the restored iframe. Returns
 * a navigation intent only when the message has our shape and its href is a
 * real archive URL, so a stray or hostile message cannot steer the shell to an
 * arbitrary address. Everything else returns null.
 */
export function parseRestoredMessage(data: unknown): RestoredNavigate | null {
  if (data === null || typeof data !== 'object') {
    return null;
  }
  const message = data as Record<string, unknown>;
  if (message.source !== 'seance-restored' || message.type !== 'navigate') {
    return null;
  }
  if (typeof message.href !== 'string') {
    return null;
  }
  const parsed = parseArchiveUrl(message.href);
  if (parsed === null || parsed.originalUrl === '') {
    return null;
  }
  return { type: 'navigate', originalUrl: parsed.originalUrl };
}
