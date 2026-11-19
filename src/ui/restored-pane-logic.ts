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
 * The plain notice shown in the restored view in place of an image that failed
 * to load from the archive, instead of the browser's broken-image icon (R3.13,
 * voice.md: plain, names what happened, no blame). Single-sourced so the
 * injected guard and any test read the same text.
 */
export const RESTORED_IMAGE_PLACEHOLDER_TEXT =
  'This image was not recovered from the archive.';

/**
 * An image guard injected into the restored document (R3.13). It runs in the
 * sandboxed frame and, via capture-phase listeners plus an initial scan:
 *  - hides an image that loads at 1×1 or 0×0 (a tracking pixel, no content), so
 *    old pages are not littered with invisible one-pixel images; and
 *  - replaces an image that fails to load with a small placeholder
 *    (`data-seance-img`) carrying the plain text above, rather than leaving the
 *    browser's broken-image icon.
 * It touches only `<img>` elements and marks each once, so it is idempotent.
 */
export const IMAGE_GUARD_SCRIPT =
  '<script>(function(){' +
  'var MSG=' +
  JSON.stringify(RESTORED_IMAGE_PLACEHOLDER_TEXT) +
  ';' +
  'function placeholder(){var s=document.createElement("span");' +
  's.setAttribute("data-seance-img","missing");s.setAttribute("role","note");' +
  's.textContent=MSG;return s;}' +
  'function tracking(img){return img.naturalWidth<=1&&img.naturalHeight<=1;}' +
  'function onLoad(img){if(img.getAttribute("data-seance-img"))return;' +
  'if(tracking(img)){img.setAttribute("data-seance-img","tracking");' +
  'img.style.display="none";}}' +
  'function onError(img){if(img.getAttribute("data-seance-img"))return;' +
  'var p=placeholder();if(img.parentNode){img.parentNode.replaceChild(p,img);}}' +
  'document.addEventListener("load",function(e){' +
  'var t=e.target;if(t&&t.tagName==="IMG")onLoad(t);},true);' +
  'document.addEventListener("error",function(e){' +
  'var t=e.target;if(t&&t.tagName==="IMG")onError(t);},true);' +
  'function scan(){var imgs=document.getElementsByTagName("img");' +
  'for(var i=0;i<imgs.length;i++){var im=imgs[i];' +
  'if(im.complete&&im.naturalWidth>0)onLoad(im);}}' +
  'if(document.readyState!=="loading"){scan();}' +
  'else{document.addEventListener("DOMContentLoaded",scan);}' +
  '})();</script>';

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

/**
 * A fit-to-width script injected into the restored document (R3.12). Old pages
 * assume a fixed width (500–800px tables, a 550px Flash stage) and overflow the
 * Restored pane, badly at 375px. On load and on every resize it measures the
 * document's true width against the frame's own width and, when the content is
 * wider, scales the body down with a CSS `transform` (never `zoom`, so pointer
 * events still reach Ruffle and links). It only ever scales down. There is no
 * transition, so it adds no motion. It re-fits on resize, and also when the
 * document's child nodes change, because Ruffle replaces each Flash embed with
 * its own player element at the movie's natural width after the first fit (task
 * 43).
 */
export const FIT_TO_WIDTH_SCRIPT =
  '<script>(function(){' +
  'function fit(){var b=document.body;if(!b)return;' +
  // Reset first so we measure the page's own width, not a prior scaling.
  'b.style.transform="none";b.style.width="auto";' +
  'var sw=document.documentElement.scrollWidth;' +
  'var vw=window.innerWidth||document.documentElement.clientWidth;' +
  'if(!sw||!vw)return;' +
  'var k=Math.min(1,vw/sw);' +
  'if(k<1){b.style.transformOrigin="0 0";' +
  'b.style.transform="scale("+k+")";b.style.width=(100/k)+"%";}}' +
  // Coalesce bursts of calls into one fit on the next frame.
  'var pending=false;function schedule(){if(pending)return;pending=true;' +
  '(window.requestAnimationFrame||window.setTimeout)(function(){' +
  'pending=false;fit();});}' +
  'window.addEventListener("resize",schedule);' +
  'window.addEventListener("load",schedule);' +
  // Ruffle mounts asynchronously and replaces each Flash embed with its own
  // player element at the movie's natural width, overflowing the pane after the
  // first fit. Re-fit when the document's child nodes change (the embed → player
  // swap is a child-node mutation; fit only writes body.style, an attribute, so
  // observing childList/subtree does not loop on our own changes).
  'if(typeof MutationObserver!=="undefined"){' +
  'new MutationObserver(schedule).observe(document.documentElement,' +
  '{childList:true,subtree:true});}' +
  // And a few delayed fits to catch the player sizing itself once the .swf
  // finishes loading, which can happen after the insertion mutation.
  'var ts=[300,900,1800];for(var i=0;i<ts.length;i++){setTimeout(fit,ts[i]);}' +
  'if(document.readyState!=="loading"){fit();}' +
  'else{window.addEventListener("DOMContentLoaded",fit);}' +
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
 * A self-contained style for every notice Seance injects into the restored
 * document (R3.14): the stopped-redirect note (`data-seance-refresh`), the
 * Flash notices (`data-seance-flash`), and the image placeholder
 * (`data-seance-img`). The archived page has no access to the app's theme.css,
 * so the colours are literal here. Each notice carries its own dark background,
 * light ink, candle-amber accent, and sans-serif face, so it reads clearly on a
 * light or dark archived page instead of inheriting the page's default serif.
 */
export const NOTICE_STYLE =
  '<style>' +
  '[data-seance-refresh],[data-seance-flash]{' +
  'display:block;margin:0 0 12px 0;padding:10px 14px;' +
  'background:#171320;color:#ece6da;' +
  'border:1px solid rgba(236,230,218,0.22);border-left:3px solid #f4b860;' +
  'border-radius:6px;' +
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;" +
  'font-size:14px;line-height:1.5;}' +
  '[data-seance-refresh] a,[data-seance-flash] a{color:#f4b860;}' +
  '[data-seance-img]{' +
  'display:inline-block;padding:4px 8px;' +
  'background:#171320;color:#a79e90;' +
  'border:1px dashed #4d5f72;border-radius:4px;' +
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;" +
  'font-size:12px;line-height:1.4;}' +
  '</style>';

/**
 * Inject head content (the notice style, and the Ruffle config + loader when
 * present) before `</head>`, falling back to just after the `<body>` open tag.
 * Returns null when the document has neither, so the caller can place the
 * content in the body-end group instead of prepending it (which would disturb a
 * bare fragment).
 */
function injectIntoHead(html: string, tag: string): string | null {
  const headEnd = /<\/head>/i;
  if (headEnd.test(html)) {
    return html.replace(headEnd, `${tag}</head>`);
  }
  const bodyOpen = /<body[^>]*>/i;
  if (bodyOpen.test(html)) {
    return html.replace(bodyOpen, (match) => `${match}${tag}`);
  }
  return null;
}

/**
 * Inject the click interceptor into a full HTML document string, before
 * `</body>` when present (falling back to `</html>`, then append). The script
 * is added last so it does not depend on load order. The notice style always
 * goes into the head (R3.14); when `ruffleScriptUrl` is given, the Ruffle
 * config + loader are injected into the head too so recovered Flash embeds play
 * inside the sandboxed frame, and the Ruffle error guard is injected alongside
 * the interceptor so a failed embed degrades to the plain notice (R6.7). The
 * image guard (R3.13) and fit-to-width script (R3.12) are injected for every
 * page.
 */
export function buildRestoredSrcDoc(
  html: string,
  options: RestoredSrcDocOptions = {},
): string {
  let out = html;
  const hasRuffle =
    options.ruffleScriptUrl !== undefined && options.ruffleScriptUrl !== '';

  // Head content: the notice style, then (when the page has Flash) the Ruffle
  // config before its loader so the polyfill reads the config on start (R6.7).
  let headTag = NOTICE_STYLE;
  if (hasRuffle) {
    headTag += `${RUFFLE_CONFIG_SCRIPT}<script src="${options.ruffleScriptUrl as string}"></script>`;
  }
  const headed = injectIntoHead(out, headTag);
  // When there is no head or body to carry it, fold the head content into the
  // body-end group so a bare fragment still starts with its own markup.
  const bodyPrefix = headed === null ? headTag : '';
  if (headed !== null) {
    out = headed;
  }

  const injected =
    bodyPrefix +
    (hasRuffle ? RUFFLE_ERROR_GUARD_SCRIPT : '') +
    IMAGE_GUARD_SCRIPT +
    FIT_TO_WIDTH_SCRIPT +
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
