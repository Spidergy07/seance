// Pure helpers for the Restored pane: the iframe sandbox policy, the click
// interceptor injected into the archived document, and the parser for the
// messages it posts back. Kept out of the component so the trust boundary and
// the link-interception protocol are tested directly. See requirements R3.7,
// R3.8, R9.2 and design.md §8.

import { parseArchiveUrl } from '../core/archive-url.js';
import { FLASH_ERROR_MESSAGE } from '../dom/flash.js';

/**
 * The iframe sandbox policy. `allow-scripts` lets Ruffle and our click
 * interceptor run; the absence of `allow-same-origin` keeps the archived
 * document in an opaque origin, so it cannot read the Seance app, our cookies,
 * or the user's archive session (R3.7, R9.2). Top-level navigation and form
 * submission are denied by leaving their tokens out (design.md §8).
 */
export const RESTORED_SANDBOX = 'allow-scripts';

/**
 * Where the restored iframe loads Ruffle from, by default: the official Ruffle
 * self-hosted build on a public CDN. Loading this static script sends no user
 * data anywhere (R9.1); the archived `.swf` bytes Ruffle then plays are fetched
 * from the Internet Archive via the already-rewritten archive URL, the same way
 * every other restored asset loads. A deployment that self-hosts Ruffle can
 * override this with an absolute URL on its own origin (see README).
 *
 * This is the one piece that can only be confirmed in a real browser; the
 * pipeline marks a page as having playable Flash, and this is where that Flash
 * is handed to Ruffle. See README "Browser-only checks".
 */
export const DEFAULT_RUFFLE_SRC = 'https://unpkg.com/@ruffle-rs/ruffle';

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
 * A navigation guard injected into the restored document. It keeps the frame on
 * the restored page by cancelling anything that would navigate it to the live
 * web: form submissions are stopped, and `window.open` is neutralised so popups
 * cannot escape. Top-level navigation is already denied by the sandbox (no
 * `allow-top-navigation` token); meta refresh is neutralised at rewrite time.
 * Together these cover the self-navigation paths that blanked the pane (R3.9).
 */
export const NAVIGATION_GUARD_SCRIPT =
  '<script>(function(){' +
  'document.addEventListener("submit",function(e){e.preventDefault();},true);' +
  'try{window.open=function(){return null;};}catch(_e){}' +
  '})();</script>';

/**
 * Ruffle configuration, injected into the frame BEFORE the Ruffle loader so the
 * polyfill reads it on start. It turns off Ruffle's unsupported-content warning
 * UI (`warnOnUnsupportedContent`) — the source of the clipped red strip over a
 * tiny embed — and the context menu and unmute overlay, and lets recovered
 * movies autoplay. Everything here is an app-controlled constant, not archived
 * content (R6.7).
 */
export const RUFFLE_CONFIG_SCRIPT =
  '<script>window.RufflePlayer=window.RufflePlayer||{};' +
  'window.RufflePlayer.config=Object.assign({},window.RufflePlayer.config,{' +
  'warnOnUnsupportedContent:false,autoplay:"on",unmuteOverlay:"hidden",' +
  'contextMenu:false,splashScreen:false});' +
  '</script>';

/**
 * A guard injected into the frame that degrades a failed Flash embed to the
 * plain voice.md notice instead of leaving Ruffle's broken error strip (R6.7,
 * R6.5). It listens for an `error` event from a polyfilled Ruffle element
 * (`<ruffle-object>`, `<ruffle-embed>`, `<ruffle-player>`) and replaces that
 * element with the plain notice. Best-effort and browser-only; the notice text
 * is the single-sourced `FLASH_ERROR_MESSAGE`.
 */
export const RUFFLE_ERROR_GUARD_SCRIPT =
  '<script>(function(){' +
  'var MSG=' +
  JSON.stringify(FLASH_ERROR_MESSAGE) +
  ';' +
  'function notice(){var d=document.createElement("div");' +
  'd.setAttribute("data-seance-flash","error");d.setAttribute("role","note");' +
  'var p=document.createElement("p");p.textContent=MSG;d.appendChild(p);return d;}' +
  'function isRuffle(n){return !!(n&&n.tagName&&/^RUFFLE-/.test(n.tagName));}' +
  'document.addEventListener("error",function(e){' +
  'var t=e.target;while(t&&!isRuffle(t)){t=t.parentNode;}' +
  'if(t&&t.parentNode){t.parentNode.replaceChild(notice(),t);}' +
  '},true);' +
  '})();</script>';

/** Options for assembling the restored document for the iframe. */
export interface RestoredSrcDocOptions {
  /**
   * When set, a Ruffle `<script>` pointing here is injected so recovered
   * `.swf` embeds left in the document play inside the iframe (R6.1, R6.2).
   * Left unset when the page has no playable Flash, so Ruffle is not loaded.
   */
  ruffleScriptUrl?: string;
}

/**
 * Inject the Ruffle config and loader into the document head (falling back to
 * the body open tag, then prepend). The config is placed before the loader so
 * Ruffle reads it on start (R6.7). Ruffle's self-hosted build polyfills
 * `<object>` and `<embed>` `.swf` references once it loads. The URLs/scripts
 * here are app-controlled constants, not archived content.
 */
function injectRuffle(html: string, url: string): string {
  const tag = `${RUFFLE_CONFIG_SCRIPT}<script src="${url}"></script>`;
  const headEnd = /<\/head>/i;
  if (headEnd.test(html)) {
    return html.replace(headEnd, `${tag}</head>`);
  }
  const bodyOpen = /<body[^>]*>/i;
  if (bodyOpen.test(html)) {
    return html.replace(bodyOpen, (match) => `${match}${tag}`);
  }
  return tag + html;
}

/**
 * Inject the click interceptor into a full HTML document string, before
 * `</body>` when present (falling back to `</html>`, then append). The script
 * is added last so it does not depend on load order. When `ruffleScriptUrl` is
 * given, the Ruffle config + loader are injected into the head first so
 * recovered Flash embeds play inside the sandboxed frame, and the Ruffle error
 * guard is injected alongside the interceptor so a failed embed degrades to the
 * plain notice (R6.7).
 */
export function buildRestoredSrcDoc(
  html: string,
  options: RestoredSrcDocOptions = {},
): string {
  let out = html;
  const hasRuffle =
    options.ruffleScriptUrl !== undefined && options.ruffleScriptUrl !== '';
  if (hasRuffle) {
    out = injectRuffle(out, options.ruffleScriptUrl as string);
  }
  const injected =
    (hasRuffle ? RUFFLE_ERROR_GUARD_SCRIPT : '') +
    NAVIGATION_GUARD_SCRIPT +
    INTERCEPTOR_SCRIPT;
  const body = /<\/body>/i;
  if (body.test(out)) {
    return out.replace(body, `${injected}</body>`);
  }
  const htmlEnd = /<\/html>/i;
  if (htmlEnd.test(out)) {
    return out.replace(htmlEnd, `${injected}</html>`);
  }
  return out + injected;
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
