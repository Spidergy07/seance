# Seance — Design

This document describes the architecture, the data flow, the link rewriter and
its invariants, and the error states. It implements the requirements in
`requirements.md`.

## 1. Architecture overview

Three layers, kept separate so the risky logic is pure and testable:

```
Browser (static Vite bundle)
  ui/      React components, two-pane layout, death certificate
  dom/     parse archived HTML, apply rewriter, reader view, Ruffle mount
  archive/ fetch via our proxy only
  core/    PURE: url-rewriter, archive-url, capture-select, recovery
        |
        | HTTPS to our own origin
        v
Serverless function (api/)
  cdx.ts       proxy CDX queries
  snapshot.ts  proxy archived resource fetches (when needed for CORS/headers)
        |
        | HTTPS to archive.org
        v
Internet Archive Wayback Machine (CDX API + archived snapshots)
```

Why a proxy: calling the archive directly from the browser runs into CORS and
gives us no place to handle timeouts, retries, and rate limiting. The proxy is
stateless and holds no user data (R9.1, R9.5).

## 2. Domain types (core/types.ts)

```
type OriginalUrl = string;   // the dead site's URL, absolute
type ArchiveUrl  = string;   // https://web.archive.org/web/<ts>[id_]/<orig>

interface Capture {
  originalUrl: OriginalUrl;
  timestamp: string;         // 14-digit Wayback timestamp, e.g. 20080303120000
  statusCode: number;        // archived HTTP status (200, 404, ...)
  mimeType: string;
}

type AssetKind = 'image' | 'stylesheet' | 'script' | 'media' | 'flash' | 'other';

type AssetStatus = 'recovered' | 'missing' | 'unknown';

interface AssetResult {
  originalUrl: OriginalUrl;
  kind: AssetKind;
  status: AssetStatus;
  archiveUrl?: ArchiveUrl;   // present when recovered
}

interface RecoveryReport {
  selectedCapture: Capture;
  lastWorkingCapture: Capture | null;
  assets: AssetResult[];
  recoveredCount: number;
  totalCount: number;
  recoveryPercent: number;   // whole number, recovered/total * 100
}
```

## 3. Data flow (happy path)

1. User submits a URL. `ui` validates it with the WHATWG `URL` API (R1.1).
2. `archive/cdx-client` asks `api/cdx` for captures of that URL (R2.1).
3. `core/capture-select` picks the most recent status-200 capture and also
   finds the last working capture for the certificate (R2.2, R2.5).
4. `archive/snapshot-client` fetches the archived HTML for the selected capture
   using the `id_` raw modifier so we rewrite links ourselves rather than
   inheriting the archive's own rewriting.
5. `dom/rewrite-document` parses the HTML (`DOMParser` in browser, `linkedom`
   in tests) and, for every resource attribute, calls
   `core/url-rewriter.rewrite()` (R3.1–R3.6).
6. For each referenced asset, the app checks capture existence (batched CDX
   lookups) and builds `AssetResult`s; `core/recovery` computes the report
   (R4.x). The asset checks are bounded (§3.1): a small, fixed cap on how many
   assets are checked, a small concurrency limit, and a session cache, so one
   recovery of a typical page makes only a handful of archive requests
   (R8.7, R8.8).
7. `dom/reader` runs readability on the parsed DOM and rewrites its asset URLs
   with the same rewriter (R7.1, R7.4).
8. `dom/flash` finds `.swf` references and mounts Ruffle for those with a
   working capture (R6.x).
9. `ui` renders: `RestoredPane` (sandboxed iframe), `ReaderPane`,
   `DeathCertificate`, and any `StatusBanner`.

## 3.1 Traffic and time bounds (tasks 32–34)

A recovery used to fire one CDX request per referenced asset (dozens on a busy
page), each with its own retry/backoff, so a single page could make 50+ archive
requests and, under rate limiting, spin for over a minute. Three bounds keep a
recovery cheap and quick:

- **Asset-check cap + concurrency (R8.7).** `resolveAssetStatuses` checks at
  most `DEFAULT_MAX_CHECKED_ASSETS` distinct assets, chosen by kind priority
  (stylesheet, script, Flash, then image, media, other), and
  `createCaptureLookup` runs at most 2 checks at once. Assets past the cap are
  reported `unknown` — honest, never counted as recovered (R4.4, R8.6). With
  the main-page CDX (1) and the snapshot (1), a typical page stays under six
  archive requests.
- **Session CDX cache (R8.8).** `fetchCaptures` consults an injected
  `CdxCache`; a repeated lookup of the same URL returns the cached captures
  with no new request. The browser shares one cache across recoveries (so
  re-recovering a page, or following an internal link back to it, is free), and
  the proxy keeps a short-lived in-memory cache keyed only by the queried URL.
  Both are ephemeral and hold no user identity, so R9.5 still holds. Only
  successful responses are cached, so a transient failure can still be retried.
- **Overall deadline (R8.9).** `recover` runs under a single deadline (about
  20s). It threads one `AbortSignal` into every archive fetch; when the deadline
  passes, in-flight requests abort. An abort during the main CDX or snapshot
  fails the recovery with the timeout state; an abort during the asset-check
  phase just leaves the remaining assets `unknown` and renders the partial page
  (R8.5). The deadline timer is always cleared when the recovery settles.

Progress (R8.10): `recover` reports each step it enters through an injected
`onProgress` callback, and the shell shows the current step's plain line while
waiting, instead of one static message.

## 4. The link rewriter (core/url-rewriter.ts)

The rewriter is the correctness-critical unit. It is pure: no DOM, no network.

### 4.1 Signature
```
interface RewriteContext {
  timestamp: string;        // selected capture timestamp
  pageOriginalUrl: string;  // absolute URL of the captured page (resolution base)
  raw?: boolean;            // use id_ modifier (default true for assets we re-fetch)
}

function rewrite(ref: string, ctx: RewriteContext): string
```

### 4.2 Algorithm
1. Trim the reference. If empty, return it unchanged.
2. If the scheme is non-resolvable (`mailto:`, `tel:`, `javascript:`, `data:`,
   `blob:`, `about:`), return it unchanged (R3.6).
3. If `ref` is a pure fragment (`#foo`), return it unchanged — it stays local to
   the current archived document (R3.3).
4. Detect already-archived input: if `ref` matches the archive-URL shape, parse
   out its embedded original URL and timestamp; rewriting proceeds from the
   embedded original so a second pass is a no-op (idempotence, R3.5).
5. Resolve `ref` against `pageOriginalUrl` using `new URL(ref, pageOriginalUrl)`
   to get an absolute original URL. This preserves query and fragment (R3.2,
   R3.3).
6. Build the archive URL:
   `https://web.archive.org/web/<timestamp>[id_]/<absoluteOriginalUrl>`.
7. Re-attach the fragment from the resolved URL to the final archive URL so the
   fragment survives the prefixing (R3.3).
8. Return the archive URL.

`archive-url.ts` owns the exact prefix format and a parser
(`parseArchiveUrl`) used by step 4. Keeping prefix construction in one module
means the confinement invariant has a single source of truth.

### 4.3 Invariants (property-tested with fast-check)
For all generated inputs:

- **I1 Idempotence:** `rewrite(rewrite(x, ctx), ctx) === rewrite(x, ctx)` for
  any resolvable `x`. A second pass must not double-prefix. (R3.5)
- **I2 Confinement:** for any resolvable `x`, `rewrite(x, ctx)` starts with
  `https://web.archive.org/web/`. The rewriter never emits a URL whose host is
  outside the archive. (R3.4)
- **I3 Fragment preservation:** if `x` has fragment `#f`, then
  `rewrite(x, ctx)` ends with `#f` (for resolvable, non-pure-fragment inputs).
  Pure-fragment inputs are returned unchanged. (R3.3)
- **I4 Query preservation:** the query string of the resolved original URL
  appears in the output unchanged. (R3.3)
- **I5 Passthrough:** for non-resolvable schemes, `rewrite(x) === x`. (R3.6)
- **I6 Timestamp fidelity:** the output's embedded timestamp equals
  `ctx.timestamp`.

Generators: fast-check produces random schemes, hosts, path segments, query
params, and fragments, plus edge cases (empty path, trailing slash, already
-archived URLs, protocol-relative `//host/path`, mixed case schemes).

### 4.4 Edge cases the rewriter must handle
- Protocol-relative URLs (`//cdn.example.com/x.js`): resolve against the page
  URL's scheme, then prefix.
- Already-archived with a different timestamp: re-point to `ctx.timestamp`
  (I6), still idempotent for the same timestamp.
- `srcset`: split on commas into (url, descriptor) pairs, rewrite each url,
  re-join. Descriptors are preserved verbatim.
- CSS `url(...)`: extract the inner URL (with or without quotes), rewrite, put
  it back with the original quoting.

## 5. Capture selection (core/capture-select.ts)
- Input: parsed CDX rows (`[urlkey, timestamp, original, mimetype, statuscode,
  digest, length]`).
- `selectBest(rows)`: filter to `statuscode === 200`, sort by timestamp
  descending, return the first. (R2.2)
- `lastWorking(rows)`: same filter, return the most recent — used for the
  certificate even if the user later picks an earlier capture. (R2.5)
- If no 200 rows, return `{ best: null, fallback: mostRecentAny }` so the UI can
  offer a best-effort non-200 capture. (R2.3)
- `byDate(rows)`: de-duplicated, sorted list for the capture picker. (R2.4)
- `selectByTimestamp(rows, ts)`: the capture with that exact timestamp, or null.
  The capture picker uses it to open an older capture the visitor chose; the
  recovery pipeline passes the chosen timestamp through `recover(..., {
  timestamp })`. `ui/capture-picker-logic.groupCapturesByYear` groups `byDate`
  output by year for the picker's year→date controls (R2.4).

## 6. Recovery accounting (core/recovery.ts)
- Input: the list of `AssetResult`s produced while rewriting + checking.
- `recovered = assets.filter(a => a.status === 'recovered').length`.
- `total = assets.length`.
- `recoveryPercent = total === 0 ? 100 : Math.round(recovered / total * 100)`.
- `unknown` and `missing` never count as recovered (R4.4, R8.6).
- Grouping for the report: bucket missing assets by `kind` (R4.5).
- Recovered means status 200 (R4.6). `dom/asset-status.resolveAssetStatuses`
  counts an asset recovered only when its looked-up capture is a 200; a capture
  with any other status (including a 3xx redirect) is `missing`, and a URL the
  lookup left undetermined is `unknown`. `core/capture-select.selectBest`
  already filters to 200, so a redirect-only asset resolves to no working
  capture and is reported missing. Note a consequence seen on GeoCities
  tracking pixels: an asset can have a working capture at a timestamp far from
  the page's (e.g. 11 years later), so the page-timestamp `id_` URL 302-
  redirects at render time even though accounting found a 200 elsewhere; the
  restored-view image guard (§8.1, R3.13) catches that at runtime.
- Liveness (R5.1): `core/liveness.classifyLiveness(timestamp, now)` decides
  whether the last working capture is recent (within `RECENTLY_ALIVE_DAYS`, 30).
  When it is, the certificate does not show a death date; it shows "Still
  answering recently. Last saved copy: <date>." and points the visitor at the
  capture picker to open an older version. `now` is injected so the function is
  pure and testable; the UI passes the real clock.
- Redirect-stub death date (R2.7, task 51): the "most recent 200" rule can land
  on a redirect stub — a page returning HTTP 200 whose only effect is to send
  the browser elsewhere (a `<meta http-equiv="refresh">` or a body-level
  `window.location`/`location.replace`). Such a stub can keep returning 200 for
  years after the real site is gone (NASA Kids served a 714-byte JS redirect
  stub from April 2006 to its last 200 in December 2011; the real Flash homepage,
  CDX digest `HU24…`, was captured only until early 2006). So:
  - `core/redirect-stub.classifyRedirectStub(html)` (pure, string/regex, no DOM)
    reports whether a fetched page is a bare redirect stub and its target.
  - `core/capture-select.lastRealCapture(captures, stubDigest)` returns the most
    recent status-200 capture whose CDX `digest` differs from `stubDigest`
    (i.e. the last capture with different, real content), or the newest 200 when
    none differ. This needs the CDX `digest`, so `Capture` carries an optional
    `digest` and `parseCdxRows` fills it (field index 5).
  - `recover` fetches the newest-200 snapshot (the default selection), and when
    it is a redirect stub and an earlier real capture exists, it shows and dates
    that real capture instead. This costs at most one extra snapshot fetch and
    only on the default path; an explicit picker choice is shown as-is. The
    capture picker still lists every saved day, so the stub stays reachable.

## 7. DOM rewriting (dom/rewrite-document.ts)
- Walk these attributes: `a[href]`, `link[href]`, `script[src]`, `img[src]`,
  `img[srcset]`, `source[src]`, `source[srcset]`, `video[poster]`,
  `audio[src]`, `iframe[src]`, `frame[src]`, `object[data]`, `embed[src]`, the
  legacy presentational `background` attribute (body/table/tr/td) and
  `input[src]` (image buttons), inline `style` attributes, and `<style>` text
  content.
- Each URL goes through `core/url-rewriter.rewrite`. The DOM layer never builds
  archive URLs itself.
- `video[src]` is rewritten alongside `audio[src]` so a direct video source is
  confined too; the attribute list above names the media attributes by example.
- Asset accounting scope: the rewriter collects element-level assets (images,
  stylesheets, scripts, media, Flash, frames) for the recovery report, keyed by
  resolved original URL and de-duplicated. `<a href>` navigation links are
  rewritten for confinement but are not counted as assets. URLs referenced only
  from CSS `url(...)` (in `<style>` or inline `style`) are rewritten for
  confinement but are not individually enumerated in the report, to keep the
  recovery count bounded.
- Zero-content tracking pixels are excluded from accounting (R4.7, task 45). An
  `<img>` whose declared `width` and `height` are both 0 or 1 is a web bug (e.g.
  GeoCities `visit.gif`, `geo.yahoo.com/serv`); its `src` is still rewritten to
  the archive for confinement, but it is not recorded as an asset, so it counts
  toward neither recovered nor missing nor the total. This matches the
  render-time image guard that hides 1×1/0×0 images (R3.13), so the certificate
  count equals what the page shows. An image with no declared size is still
  counted; the render guard still hides it if it loads at 1×1/0×0.
- `<base>` tags are removed or neutralised so they cannot redirect resolution
  off the archive.
- `<frame src>` is rewritten alongside `<iframe src>` so archived framesets
  render from the archive rather than fetching dead-origin frames (R3.10).
- `<meta http-equiv="refresh">` is neutralised: the element is removed so the
  restored page cannot navigate itself away, and its target (if any) is
  rewritten to the archive and surfaced as a visible link that re-runs recovery
  (R3.9). `<meta http-equiv="Content-Security-Policy">` is removed so the
  original page's policy cannot block archive-served assets or the in-frame
  interceptor (R3.11).
- Internal `<a>` clicks are intercepted by the app shell (not here) to re-run
  recovery (R3.8).

## 8. Restored view sandboxing (ui/RestoredPane.tsx)
- The rewritten HTML is rendered in an `<iframe sandbox="allow-scripts">`. The
  frame stays in an opaque origin (no `allow-same-origin`), so scripts can run
  (for Ruffle and the click interceptor) but archived content cannot read the
  Seance app, its cookies, or the user's archive session. Top-level navigation
  and form submission are denied by leaving their tokens out.
- Archived content is untrusted input (R9.2). The sandbox is the trust
  boundary. Links inside post messages to the shell to trigger re-recovery.
- A navigation guard is injected into the frame alongside the click
  interceptor (R3.9): it cancels form submissions and neutralises `window.open`
  so archived markup and script cannot steer the frame onto the live web. Top
  navigation is already denied by leaving `allow-top-navigation` out of the
  sandbox token list; the guard plus the meta-refresh neutralisation in §7
  cover the self-navigation paths (meta refresh, forms, popups) that otherwise
  blanked the restored view.

### 8.1 In-frame scripts injected into the restored document (tasks 39–41)

`buildRestoredSrcDoc` (ui/restored-pane-logic.ts) assembles the iframe document.
Besides the click interceptor and navigation/Ruffle guards (§8, §9.2), it
injects three app-controlled pieces. All are constants, never archived content.

- **Fit-to-width (R3.12, task 40).** Old pages assume a fixed width (500–800px
  tables, a 550px Flash stage) and overflow the pane, badly at 375px and in the
  ~546px desktop pane. A small script measures `documentElement.scrollWidth`
  against the frame's own `innerWidth` and, when the content is wider, applies a
  CSS `transform: scale(k)` with `transform-origin: top left` and a compensating
  width so the page fits. It only scales down (`k = min(1, innerWidth/scrollWidth)`),
  re-measures on `resize`, and uses `transform` (not `zoom`) so pointer events
  still reach Ruffle and links. Reduced-motion is respected by having no
  transition. Ruffle mounts asynchronously and replaces each Flash embed with
  its own player element at the movie's natural width (e.g. 550px) after the
  first fit ran, so the script also re-fits when the document's child nodes
  change (a `MutationObserver` on `childList`/`subtree`; the embed → player swap
  is a child-node mutation, so it does not loop on fit's own `body.style`
  writes) and a few times on a short timer to catch the player sizing itself
  once the `.swf` loads (task 43, R3.12).
- **Image guard (R3.13, task 39).** A capture-phase `load`/`error` listener on
  the document: an image that loads at 1×1 or 0×0 (a tracking pixel, no content)
  is hidden; an image that fails to load is replaced with a small styled
  placeholder (`data-seance-img`) carrying the plain text
  `RESTORED_IMAGE_PLACEHOLDER_TEXT`, instead of the browser's broken-image icon.
  An initial scan covers images that settled before the listener attached.
- **Notice style (R3.14, task 41).** A `<style>` with self-contained rules for
  every Seance-injected notice (`[data-seance-refresh]`, `[data-seance-flash]`,
  `[data-seance-img]`): its own dark background, light ink, candle-amber accent,
  and sans-serif face, so the notices read clearly on light or dark archived
  pages rather than inheriting the page's default serif. The style is injected
  into `<head>` when present, else into the body-end group; colours are literal
  (the iframe has no access to the app's theme.css variables).

## 9. Flash via Ruffle (dom/flash.ts)
- Detect `<object>/<embed>` referencing `.swf` and bare `.swf` links.
- For each, check capture status against the recovery report.
- Because the restored page renders inside the sandboxed iframe (§8), Ruffle
  runs *inside that frame*, not in the app's document. The pipeline therefore
  splits the work:
  - `applyFlashNotices` (in `src/ui/recover.ts`, before serialising the
    document) replaces every confirmed-missing `<object>/<embed>` `.swf` with
    the plain "not saved" notice (R6.3). Recovered and undetermined embeds are
    left in place, their `.swf` URL already pointed at the archive.
  - `RestoredPane` injects the Ruffle loader into the iframe's `srcdoc` only
    when the page has at least one playable embed (`view.hasFlash`). Ruffle's
    self-hosted build polyfills the remaining `<object>/<embed>` and plays the
    archived raw `.swf` (R6.1, R6.2). The `.swf` bytes load from the archive the
    same way every other restored asset does.
  - Ruffle is loaded from its official distribution (a pinnable CDN build by
    default, overridable with a self-hosted URL on the app's own origin). A load
    or init failure is contained by the iframe and does not break the app
    (R6.5).
- `mountFlash` + the injectable `RuffleFactory` remain the unit-tested model for
  mounting a player directly into a `Document`; the iframe path above is the
  runtime wiring that keeps Flash inside the trust boundary.
- Browser-only: that a real archived `.swf` actually plays can only be confirmed
  in a browser; it is listed in the README manual checklist (task 25).

### 9.1 The `.swf` CORS proxy (api/swf.ts, task 35, R6.6)
The restored iframe runs in an opaque origin (`srcdoc` + `sandbox` without
`allow-same-origin`). When Ruffle there fetches the raw archive `.swf`, the
browser applies CORS and `web.archive.org` sends no `Access-Control-Allow-Origin`
for the raw (`id_`) bytes, so the fetch is blocked. Seance therefore serves the
`.swf` through its own same-origin proxy:

- `api/swf.ts` takes `?url=<archive .swf url>`, validates the URL's host is
  exactly `web.archive.org` (anything else → 400, so it is not an open proxy),
  fetches it under the shared `fetchWithRetry` timeout/retry policy, and relays
  the bytes with `access-control-allow-origin: *` and a Flash content type
  (upstream's, else `application/x-shockwave-flash`). Stateless, no persistence.
- `core/swf-proxy.ts` is the pure builder/parser for the endpoint URL:
  `buildSwfProxyUrl(archiveUrl, proxyBase)` → `<proxyBase>?url=<archiveUrl>`.
  The target stays an archive URL, so confinement (I2/R3.4) holds through the
  proxy; the document-level confinement check treats an `/api/swf` URL as
  confined when its `url` param is an archive URL.
- `dom/rewrite-swf.ts` runs in the recovery pipeline *after* `applyFlashNotices`
  (so confirmed-missing embeds are already notices): it rewrites the remaining
  `.swf` `object[data]`/`embed[src]`/`param[name=movie|src]` values (already
  archive URLs) to the absolute proxy URL. The app origin is injected
  (`swfProxyBase`), defaulting in the browser to `window.location.origin + /api/swf`.
- Registered in the dev router (`/api/swf`); on Vercel it deploys as an Edge
  function from the file, like `cdx.ts`/`snapshot.ts`.

### 9.2 Ruffle bootstrap and tiny-embed failure (task 38, R6.7)
The restored frame injects a small Ruffle bootstrap that sets
`window.RufflePlayer.config` to turn off Ruffle's unsupported-content warning UI
(`warnOnUnsupportedContent: false`) and installs an error listener: when a
polyfilled Ruffle player reports an error (including a load failure on a tiny
embed), it replaces the player with the plain voice.md "could not play" notice,
so a 10px embed never shows a clipped red strip.

### 9.3 Flash stage sizing and Ruffle base (task 50, R6.8)
Old Flash pages size the stage in percentages (NASA Kids'
`<object>/<embed>` are `width="90%" height="90%"`). A percentage height resolves
to zero unless an ancestor has a definite height, so in the `srcdoc` document
the stage collapsed to a thin strip and no player showed, even though the `.swf`
bytes loaded through `/api/swf`. When the page has Flash, `buildRestoredSrcDoc`
injects a stage style (`html,body{height:100%}` plus a `min-height` on
`object`/`embed`/`ruffle-player`/`ruffle-object`/`ruffle-embed`) so a
percentage-size stage has a definite height to resolve against. It is injected
only for Flash pages, so ordinary pages' layout is untouched.

The Ruffle config also carries a `base`: the page's raw archive prefix
(`buildArchiveUrl(pageOriginalUrl, timestamp, { raw: true })`), passed as
`pageArchiveBase`. A `.swf` that loads further movies by a relative path then
resolves them against the archive rather than against the opaque `srcdoc`
origin. The base's target stays an archive URL, so confinement (R3.4) holds;
whether a given archive resource then returns CORS headers is outside our
control, but the primary movie always loads through `/api/swf`. That a real
`.swf` paints can only be confirmed in a browser (README checklist).

## 10. Reader view (dom/reader.ts)
- Run readability on a clone of the parsed DOM (readability mutates its input).
- Rewrite asset URLs in the extracted content with the same rewriter (R7.4).
- If no article is found, show the plain "no readable article" notice and keep
  the restored view (R7.3). The shell collapses the reader note to a small line
  and gives the restored view the full pane width in that case, rather than
  leave an empty half-width card next to the restored page (task 44). The pure
  `ui/result-layout.resultPanesClass(readerOk)` returns the panes container
  class (`panes` vs `panes panes--solo`); `panes--solo` is one full-width
  column at every width.

## 11. Error states

| State            | Trigger                                   | Behaviour (req)                                                                 |
|------------------|-------------------------------------------|---------------------------------------------------------------------------------|
| Invalid URL      | input fails URL validation                | inline message, no network call (R1.2)                                          |
| No captures      | CDX returns zero rows                      | "no contact" panel, next steps (R8.1)                                           |
| No working capture | rows exist, none are 200                 | explain saved-but-never-OK, offer best-effort non-200 (R2.3)                    |
| Slow archive     | response exceeds soft threshold           | show progress; hard timeout aborts the request (R8.2)                           |
| Rate limited     | 429 or archive throttling signal          | bounded backoff + retry, visible countdown, give up with plain message (R8.3)   |
| Archive outage   | network error or 5xx                      | state it is archive/network side, offer retry (R8.4)                            |
| Partial recovery | some assets missing/unknown               | render what loaded, show recovered vs missing counts (R8.5, R4.3)               |
| Flash missing    | `.swf` has no capture                     | plain "not saved" notice, rest of page renders (R6.3)                           |
| Ruffle failure   | Ruffle load/init throws                    | plain error, rest of page renders (R6.5)                                        |

### Timeout / retry policy
- Per-request hard timeout in the proxy and the client. The proxy's default is
  6s per attempt with at most 2 attempts and a short, capped backoff (≤2s, and
  any `Retry-After` is capped to that), so a sustained 429 surfaces in a couple
  of seconds instead of tens of seconds (R8.9). The browser client passes the
  recovery's deadline `AbortSignal` into every fetch, so a hung proxy cannot
  hold the UI open past the deadline.
- Retries only on 429 and transient 5xx/network errors. Exponential backoff
  with jitter, capped attempts. No retry on 4xx other than 429.
- The proxy sets a descriptive User-Agent and respects `Retry-After` when
  present (capped to the backoff ceiling).
- An abort mapped from the client's deadline becomes the `timeout` client error
  kind, which the shell shows as the timeout state with a retry control. The
  `rate-limited`, `timeout`, `outage`, and `network` states are all retryable.

## 12. Testing strategy
- `core/` has full unit coverage; `url-rewriter` additionally has the fast-check
  property suite for I1–I6.
- `capture-select` and `recovery` are tested with crafted CDX fixtures,
  including the no-200 and empty cases.
- `dom/rewrite-document` is tested against `linkedom` using fixture HTML, and
  asserts confinement: after a full-document rewrite, no element references a
  non-archive host.
- No test performs real network I/O (N2).

## 13. Deployment
- Static bundle from `vite build`, served on a free static host.
- `api/` deployed as the host's serverless function. Stateless; a short-lived
  in-memory cache of CDX responses only (keyed by the queried URL, no user
  data), consistent with R8.8 and R9.5.
