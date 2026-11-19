# Kiro build log

Factual, per-task notes for the Kiroween 2026 write-up. Each entry records what
was built, which Kiro features were used, and any problem hit.

## Task 1 — Initialise the toolchain

- Created `package.json` (scripts: `dev`, `build`, `test`, `test:watch`,
  `lint`, `typecheck`), `tsconfig.json` (strict, with
  `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` to keep the
  rewriter honest), `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`
  (flat config), `index.html`, `src/main.tsx` placeholder, and `.gitignore`.
- Installed dev dependencies locally with pinned exact versions (no global
  installs): vite, @vitejs/plugin-react, vitest, typescript, eslint +
  typescript-eslint, react/react-dom and their types.
- Kiro features used: the `tech.md` and `structure.md` steering docs drove the
  stack and the folder layout; the `seance` spec `tasks.md` defined the done
  criteria.
- Problems hit:
  - First `npm install` timed out mid-run and left `devDependencies` empty, so a
    follow-up install removed everything. Fixed by writing the pinned versions
    into `package.json` first, then running one install.
  - esbuild's postinstall is blocked by this machine's allowScripts policy, but
    the platform binary package (`@esbuild/darwin-arm64`) was installed anyway,
    so vite/vitest run fine.
  - `vitest run` exits 1 when there are no test files; added `--passWithNoTests`
    so the zero-test criterion exits 0.
- Verified: `npm run typecheck` exits 0, `npm test` exits 0 (no tests yet),
  `npm run lint` clean, `npm run build` produces a static bundle.

## Task 2 — Set up the test environment

- Added `linkedom` and `fast-check` as pinned dev dependencies.
- Added `tests/setup.sample.test.ts` with three checks: vitest runs under Node,
  linkedom parses HTML and exposes a DOM, and fast-check runs a property.
- Kiro features used: spec `tasks.md` (done criteria), `tech.md` steering
  (vitest + linkedom + fast-check, Node-only, offline).
- Property-based testing is introduced here as a smoke test; the real rewriter
  properties come in task 6.
- Problems hit: none. esbuild/fsevents postinstall warnings from the
  allowScripts policy are harmless (platform binaries already present).
- Verified: 3 tests pass, typecheck and lint clean.

## Task 3 — Domain types

- Implemented `src/core/types.ts`: `OriginalUrl`, `ArchiveUrl`, `Capture`,
  `AssetKind`, `AssetStatus`, `AssetResult`, `RecoveryReport`, matching
  design.md section 2. Type-only module, no runtime code.
- Kiro features used: `design.md` section 2 defined the shapes verbatim;
  `structure.md` fixed the location under `src/core/`.
- Problems hit: none. Typecheck and lint clean.

## Task 4 — Archive URL module

- Implemented `src/core/archive-url.ts`: `buildArchiveUrl`, `parseArchiveUrl`,
  `isArchiveUrl`, plus exported `ARCHIVE_HOST` and `ARCHIVE_PREFIX` constants so
  the confinement invariant has one source of truth.
- `buildArchiveUrl` throws on a non-14-digit timestamp so a bad capture can't
  yield a bad archive URL. `parseArchiveUrl` accepts an optional Wayback
  modifier (`id_`, `im_`, `js_`, ...) and only treats `id_` as raw.
- Tests (`tests/core/archive-url.test.ts`, 19 cases): exact prefix shape with
  and without `id_`, query/fragment appended verbatim, timestamp validation,
  non-id_ modifier handling, http vs https, and the round-trip
  `parse(build(u, ts)) === { u, ts, raw }` across several URLs.
- Kiro features used: `design.md` §4.2/§4.4 (prefix format, modifier),
  `requirements.md` R3.1, spec task done-criteria for the round-trip test.
- Problems hit: none. 22 tests pass (incl. earlier), typecheck and lint clean.

## Task 5 — URL rewriter (example tests)

- Implemented `src/core/url-rewriter.ts` `rewrite(ref, ctx)` following
  design.md §4.2: trim, pass through empty/pure-fragment/non-resolvable
  schemes, detect already-archived input and rewrite from its embedded
  original, resolve with the WHATWG `URL` API against `pageOriginalUrl`, then
  build the archive URL. `raw` defaults to true.
- Tests (`tests/core/url-rewriter.test.ts`, 18 cases): absolute, relative,
  root-relative, protocol-relative, query+fragment, empty, pure fragment,
  `mailto:`/`tel:`/`javascript:`/`data:`/`about:`/`blob:` pass-through,
  case-insensitive scheme detection, already-archived re-pointing, an
  idempotence spot-check, and the raw-flag on/off/default behaviour.
- Kiro features used: `design.md` §4.2 algorithm, `requirements.md` R3.1–R3.6.
- Design decision worth noting: the resolved URL's fragment and query ride
  inside the embedded original URL (Wayback's own scheme), so no separate
  "re-attach fragment" step is needed; design.md §4.2 step 7 is satisfied by
  construction.
- Problems hit: none. 40 tests pass, typecheck and lint clean.

## Task 6 — URL rewriter (property tests)

- Added `tests/core/url-rewriter.prop.test.ts` with fast-check generators for
  timestamps, base URLs, and resolvable references (absolute, relative,
  root-relative, protocol-relative), plus non-resolvable and already-archived
  references.
- Asserts the design.md §4.3 invariants, 1000 runs each:
  - I1 idempotence over arbitrary references (incl. junk strings and archive
    URLs);
  - I2 confinement: output starts with the archive prefix and its host is
    `web.archive.org`;
  - I3 fragment preservation (+ pure fragments pass through);
  - I4 query preservation;
  - I5 passthrough for non-resolvable schemes;
  - I6 timestamp fidelity via `parseArchiveUrl`.
- Kiro features used: property-based testing (fast-check) as required by
  `tech.md` and `design.md` §4.3; spec task 6 lists the exact invariants.
- Design note: query/fragment generators use a safe character set so the
  WHATWG URL API does not re-encode them, keeping the preservation assertions
  exact.
- Problems hit: none. 46 tests pass (6 property tests), typecheck and lint clean.

## Task 7 — srcset and CSS url() rewriting

- Extended `src/core/url-rewriter.ts` with `rewriteSrcset` and `rewriteCssUrls`,
  both delegating each URL to `rewrite`. srcset keeps commas, whitespace, and
  descriptors verbatim; CSS keeps the original quote style and leaves `data:`
  URLs untouched.
- Tests: `tests/core/srcset-css.test.ts` (9 example cases incl. `1x`/`2x`/`640w`
  descriptors, quoted/unquoted/single-quoted `url()`, multiple `url()`, and a
  `data:` URL left alone) and `tests/core/srcset-css.prop.test.ts` (2 property
  tests): descriptors survive and the comma count is preserved; CSS quote shape
  is preserved; every rewritten URL is an archive URL.
- Kiro features used: `design.md` §4.4 (srcset/CSS handling), property-based
  testing for shape preservation.
- Known limitation (documented in code): a `data:` URI containing commas inside
  a `srcset` candidate is not supported, because commas split candidates. Such
  URLs are rare in srcset.
- Problems hit: none. 57 tests pass, typecheck and lint clean.

## Task 8 — Capture selection

- Implemented `src/core/capture-select.ts`: `parseCdxRows` (normalises raw CDX
  rows to `Capture`s, skips the header, maps non-numeric status to 0),
  `selectBest` (most recent status-200), `lastWorking` (same, for the
  certificate), `byDate` (newest-first, de-duplicated by timestamp), and
  `selectCapture` (bundles best + the no-200 fallback).
- Added recorded CDX fixtures `tests/fixtures/cdx/mixed.json` and `no-200.json`;
  tests (`tests/core/capture-select.test.ts`, 11 cases) cover: header skipped,
  revisit status → 0, picks most recent 200 (ignores a newer 404), null when no
  200, fallback to most recent non-200, and byDate sort/dedup.
- Kiro features used: `design.md` §5, `requirements.md` R2.2–R2.5, and the
  fixtures directory from `structure.md`. Timestamps are 14-digit fixed width,
  so lexicographic string compare is correct for ordering.
- Problems hit: none. 68 tests pass, typecheck and lint clean.

## Task 9 — Recovery accounting

- Implemented `src/core/recovery.ts`: `countByStatus`, `recoveryPercent`
  (empty → 100%, whole-number rounding, only `recovered` counts),
  `groupMissingByKind` (buckets status `missing` by kind, excludes recovered
  and unknown), and `buildRecoveryReport` (assembles the `RecoveryReport`).
- Tests (`tests/core/recovery.test.ts`, 9 cases): status counts; percent
  rounding (33/67), empty → 100, all-recovered → 100, all-unknown → 0; unknown
  and missing never recovered; grouping by kind excludes recovered/unknown;
  full report counts/percent and capture fields.
- Kiro features used: `design.md` §6, `requirements.md` R4.3–R4.5 and R8.6
  (honesty: unknown is never reported as recovered).
- Problems hit: none. 77 tests pass, typecheck and lint clean.

## Task 10 — CDX proxy function

- Implemented `api/cdx.ts`: `buildCdxRequestUrl`, `fetchCdxRows`, and the
  host-agnostic `handleCdxRequest(request)` entry point (standard `Request` →
  `Response`, so it runs on Vercel/Netlify functions or a Cloudflare Worker).
  It validates the `?url=` param as an absolute http(s) URL, queries the
  Wayback CDX API with `output=json`, and returns the rows as JSON. Stateless:
  nothing persisted (R9.1, R9.5).
- Added a shared helper `api/http.ts`: `fetchWithRetry` with a hard per-attempt
  timeout (AbortController), bounded exponential backoff with full jitter, and
  retries limited to HTTP 429, 5xx, and network/timeout errors. Other 4xx are
  not retried. `Retry-After` (integer seconds or HTTP date) is honoured. A
  typed `UpstreamError` carries the failure kind, mapped to an HTTP status for
  the proxy response (design.md §11).
- The helper's side effects (fetch, sleep, random) are injectable, so the retry
  and timeout behaviour is tested offline with no real timers for backoff and a
  tiny timeout for the abort case.
- Tests: `tests/api/http.test.ts` (11 cases: success, retry on 429/5xx/network,
  give-up after capped attempts, no retry on other 4xx, timeout aborts,
  `parseRetryAfter`, status mapping) and `tests/api/cdx.test.ts` (11 cases:
  request shape + User-Agent, row parsing, empty body → no captures, retry,
  give-up, bad-request validation with no network call, handler status
  mapping).
- Spec change: added `api/http.ts` to `structure.md`'s planned layout; the
  original map listed only `cdx.ts` and `snapshot.ts`, but a shared
  timeout/retry helper keeps both proxies DRY and is referenced by task 11.
- Kiro features used: the `seance` spec (`design.md` §11 timeout/retry policy,
  `requirements.md` R2.1, R8.2–R8.4, R9.1, R9.5), `tech.md` steering (serverless
  proxy, stateless, no DB), and `structure.md` (api/ holds no DOM/React).
- Problems hit: none. 99 tests pass, typecheck clean.

## Task 11 — Snapshot proxy

- Implemented `api/snapshot.ts`: `buildSnapshotRequestUrl`,
  `fetchSnapshotResponse`, and `handleSnapshotRequest(request)`. It reads
  `?url=` and `?timestamp=`, builds the raw (`id_`) archive URL so the archive
  serves the original bytes un-rewritten, fetches through the shared
  retry/timeout helper, and relays the bytes with the upstream content type.
- The snapshot URL is built with `buildArchiveUrl` from `src/core/archive-url`,
  so the archive prefix stays defined in exactly one place. (api/ importing
  core is allowed; core imports nothing from other layers.)
- Reuses `api/http.ts` from task 10 for the timeout and retry policy, so the
  two proxies behave identically on slow/failing upstreams.
- Tests (`tests/api/snapshot.test.ts`, 7 cases): raw `id_` URL shape, User-Agent
  header, timeout aborts the attempt, 400 for a missing url or malformed
  timestamp with no network call, byte relay with the upstream content type,
  and an outage mapped to HTTP 502.
- Kiro features used: the `seance` spec (`design.md` §3 step 4 raw `id_` fetch,
  §11 timeout/retry), `requirements.md` R9.1/R9.2, and `structure.md` (api/ has
  no DOM/React; core is the single source of truth for the archive prefix).
- Problems hit: none. 106 tests pass, typecheck clean.

## Task 12 — Archive clients

- Implemented the network boundary:
  - `src/archive/result.ts`: `ClientResult<T>` (ok/err), `ClientError` with a
    `kind` the UI maps to a plain message, and `errorFromResponse` /
    `errorFromThrow` mappers (429 → rate-limited, 504 → timeout, 502/503 →
    outage, thrown fetch → network).
  - `src/archive/cdx-client.ts`: `cdxEndpoint` + `fetchCaptures`. Calls
    `/api/cdx` on our own origin, parses `{ rows }` with the pure
    `parseCdxRows` from core, returns `Capture[]`.
  - `src/archive/snapshot-client.ts`: `snapshotEndpoint` + `fetchSnapshot`.
    Calls `/api/snapshot`, returns the body text and content type.
- Both clients take an injectable `fetch` and an optional `baseUrl`. They build
  relative `/api/...` paths, so they can only reach our own proxy. Tests assert
  the called URL contains `/api/...` and never `web.archive.org`.
- Tests: `tests/archive/cdx-client.test.ts` (7 cases: endpoint shape, parse
  captures, empty rows, rate-limited/outage/network/parse-error) and
  `tests/archive/snapshot-client.test.ts` (4 cases: endpoint shape, body+type,
  timeout, network). No test performs real network I/O.
- Spec change: added `src/archive/result.ts` to `structure.md`; the original
  map listed only the two client files, but the shared result/error types and
  mappers belong in one place both clients import.
- Kiro features used: the `seance` spec (`design.md` §1/§3, `requirements.md`
  R9.1/R9.2), `structure.md` (archive/ is the only network layer and may import
  the pure core), and `tech.md` (typed results, offline tests).
- Problems hit: none. 117 tests pass, typecheck clean.

## Task 13 — Document rewriter

- Implemented `src/dom/rewrite-document.ts`: `rewriteDocument(doc, ctx)` walks
  the design.md §7 attribute set (`a[href]`, `link[href]`, `script[src]`,
  `img[src]`, `img[srcset]`, `source[src]`, `source[srcset]`, `video[poster]`,
  `video[src]`, `audio[src]`, `iframe[src]`, `object[data]`, `embed[src]`,
  inline `style`, and `<style>` text), delegating every URL to
  `core/url-rewriter` (`rewrite`/`rewriteSrcset`/`rewriteCssUrls`). It removes
  every `<base>` element and returns the de-duplicated element-level assets it
  referenced, with a kind each (link rel → stylesheet/image/other, `.swf` →
  flash, etc.).
- Works on a `Document`, so the same code runs under `DOMParser` in the browser
  and `linkedom` in tests. HTML fixtures load as strings via Vite's `?raw`
  import (ambient declaration in `tests/raw-modules.d.ts`), avoiding Node `fs`
  typings under `types: []`.
- Tests (`tests/dom/rewrite-document.test.ts`, 7 cases, linkedom + a new
  `tests/fixtures/html/sample.html`): `<base>` removed; stylesheet/img/script
  and external links rewritten to the archive; in-page fragment and `mailto:`
  left untouched; both `srcset` candidates rewritten with descriptors kept;
  `<style>` and inline `url(...)` rewritten; a document-wide **confinement**
  sweep asserting no element references a non-archive host; and asset
  collection yielding 13 unique assets with the expected kind counts.
- Spec changes: documented in `design.md` §7 the asset-accounting scope (links
  not counted; CSS `url(...)` rewritten but not enumerated) and the addition of
  `video[src]` to the confined attribute set.
- Kiro features used: the `seance` spec (`design.md` §7, `requirements.md`
  R3.1/R3.4/R3.7-prep), `structure.md` (dom/ may use the DOM but defers every
  URL decision to core), and the fixtures layout.
- Problems hit: none. 124 tests pass, typecheck and lint clean.

## Task 14 — Asset status collection

- Added a `CaptureLookup` domain type to `src/core/types.ts`: a batched lookup
  from URLs to `Capture | null`, with the convention that an absent key means
  "undetermined" (→ unknown). A pure signature; the network lives behind it.
- Implemented `src/dom/asset-status.ts`: `resolveAssetStatuses(assets, lookup)`
  turns the assets collected by `rewriteDocument` into `AssetResult[]`. A 200
  capture → `recovered` with its raw archive URL; any other status or no
  capture → `missing`; an undetermined URL → `unknown`, never recovered
  (R4.2, R4.4, R8.6). The lookup is called once with the de-duplicated URL set
  so implementations can batch.
- Implemented `src/archive/capture-lookup.ts`: `createCaptureLookup(deps)`
  builds a `CaptureLookup` over the CDX proxy with bounded concurrency. Working
  captures map to the most recent 200 (`selectBest`); captures that were never
  200 map to `null` (missing); a failed CDX call is left absent (unknown), so a
  transient error is never reported as a confirmed miss.
- Tests: `tests/dom/asset-status.test.ts` (2 cases: all four status branches
  explicitly, plus the fixture page resolved to 11 recovered / 1 missing / 1
  unknown) and `tests/archive/capture-lookup.test.ts` (2 cases: working vs
  no-200 vs failed-lookup mapping, and the proxy-only/never-archive.org check).
- Spec change: added `src/dom/asset-status.ts` and `src/archive/capture-lookup.ts`
  to `structure.md`. The original map folded this into the rewriter/clients;
  splitting the pure resolver from the network-backed lookup keeps the dom layer
  free of network and the lookup injectable.
- Kiro features used: the `seance` spec (`design.md` §3 step 6, `requirements.md`
  R4.1/R4.2/R4.4/R8.6), `structure.md` (core holds the shared type; archive is
  the only network layer; dom defers to injected lookups).
- Problems hit: none. 128 tests pass, typecheck and lint clean.

## Task 15 — Reader view

- Installed `@mozilla/readability@0.5.0` locally (pinned, a runtime dependency
  per tech.md). It ships its own TypeScript types.
- Implemented `src/dom/reader.ts`: `extractReader(html, ctx, deps)` parses a
  fresh copy of the HTML, runs Readability on it (so it never mutates the
  caller's restored document), and on success rewrites the extracted content's
  asset URLs with `rewriteDocument` so reader-view images also load from the
  archive (R7.4). Returns `{ ok: false, reason: 'no-article' }` when no article
  is found (R7.3).
- Parsing and the Readability factory are injectable: `DOMParser` in the
  browser, `linkedom` in tests. The extracted content fragment is wrapped in a
  document shell before re-parsing so `body.innerHTML` is reliable across DOM
  implementations.
- Tests (`tests/dom/reader.test.ts`, 4 cases, with new fixtures
  `article.html` and `no-article.html`): title + body text extracted; a
  root-relative reader-view image is rewritten to an archive URL; an
  empty-body page returns the no-article result; and the no-article branch is
  also exercised deterministically with an injected extractor stub.
- Investigation note: under linkedom `document.baseURI` is null, so
  Readability's own relative-URL fixing is skipped and the content keeps
  relative/original URLs — exactly what our rewriter needs to point them at the
  archive. Readability is lenient about short pages (it still extracted a nav
  list), so the no-article fixture uses an empty body, which reliably yields a
  null parse.
- Kiro features used: the `seance` spec (`design.md` §10, `requirements.md`
  R7.1/R7.3/R7.4), `tech.md` (readability choice), `structure.md` (dom/ reuses
  the core rewriter via `rewriteDocument`).
- Problems hit: the first no-article fixture (a nav page) still extracted
  content; switched to an empty-body fixture after probing Readability's
  behaviour under linkedom.

## Task 16 — Flash detection + Ruffle mount

- Implemented `src/dom/flash.ts`:
  - `detectFlashRefs(doc)` finds `<object data>`, `<embed src>`, and bare
    `<a href>` `.swf` references, recovering the original `.swf` URL whether the
    value is still plain or already an archive URL (via `parseArchiveUrl`).
  - `flashStatus(capture)` maps a 200 capture to `recovered`, everything else to
    `missing`.
  - `mountFlash(target, options, deps)` replaces the element with a Ruffle
    player (recovered), a plain "not saved" notice (missing, R6.3), or a plain
    error notice if Ruffle fails — without throwing, so the rest of the page
    still renders (R6.5). Plain-language strings come straight from voice.md.
- Ruffle is loaded through an injectable `RuffleFactory`, so tests drive the
  mount logic with a fake player and never load WebAssembly. The real
  browser-only factory (loading Ruffle from its official distribution) is wired
  in the UI/integration phase; keeping it behind the injection boundary is the
  design's intent (design.md §9).
- Tests (`tests/dom/flash.test.ts`, 8 cases, with a new `flash.html` fixture):
  detection of object/embed/anchor `.swf` (and ignoring non-swf and a plain
  absolute `.swf`), status mapping, a recovered mount calling `player.load`
  with the archive URL and showing the playing label, the missing notice
  without loading Ruffle, and the error notice for both a load failure and a
  post-mount init failure.
- Deferred: the "one real archived .swf plays in the browser" check is manual
  and belongs to task 25 (no browser/real network here).
- Kiro features used: the `seance` spec (`design.md` §9, `requirements.md`
  R6.1–R6.5), voice.md (exact Flash messages), `structure.md` (dom/ with an
  injected loader; no WASM in tests).
- Problems hit: none. 140 tests pass, typecheck and lint clean.

## Task 17 — App shell + URL input

- Implemented the Phase 4 foundation:
  - `src/ui/url-input-logic.ts`: pure `interpretUrlInput(raw)` → empty / valid /
    guess / invalid, using the WHATWG `URL` API. A typed scheme must be http(s)
    (non-http names the scheme and is rejected, R1.2); a scheme-less host is
    offered as `https://` (R1.3). `resolvedUrl` gives the URL a submit searches.
  - `src/ui/UrlInput.tsx`: the planchette. Controlled field, placeholder and
    labels straight from voice.md, the interpreted URL shown as a hint before
    searching, inline error on blur/submit, submit disabled while busy (R1.4)
    and when there is no resolvable URL. Accessible: real `<label>`,
    `aria-describedby`, `aria-invalid`, `role="alert"`/`aria-live`.
  - `src/ui/types.ts`: the app phases (idle/running/error/done) and the
    `RecoveryView` / `RecoveryOutcome` view model the panes consume.
  - `src/ui/recover.ts`: the recovery pipeline (captures → selection → snapshot
    → rewrite → asset status → report → reader), with every side effect
    injected so it runs under linkedom in tests and the browser in production.
    Added so the shell is functional; its fixture-driven integration test is
    task 22.
  - `src/ui/App.tsx`: the state machine. Holds the phase, runs recovery via an
    injectable function, guards against a stale recovery overwriting a newer
    one, and renders idle/running screens plus placeholders the later tasks
    replace. Includes a skip link and plain-text credits.
  - `src/ui/theme.css`: the seance look — candle-amber accent for live state,
    cold grey-blue for missing, dark ground, ouija-board framed header, serif
    display type, mobile-first, all motion gated behind
    `prefers-reduced-motion`. No clipart or logos.
  - `src/main.tsx`: mounts `App` and imports the theme; `src/shims.d.ts`
    declares the `*.css` side-effect import so it typechecks under `types: []`.
- Tests: `tests/ui/url-input-logic.test.ts` (9 cases: accept/reject, scheme
  guess, query/fragment preserved, javascript: rejected); `url-input.test.ts`
  (4 cases, rendered with `react-dom/server` under Node: placeholder/labels,
  busy disables, interpreted-URL hint, empty disables submit); `app.test.ts`
  (idle screen renders title, input, plain-text credits, skip link).
- Kiro features used: the `seance` spec (`requirements.md` R1.1–R1.4,
  `design.md` §3 step 1, §11), voice.md (copy + visual rules),
  `structure.md` (ui/ holds React only; logic stays pure and separate).
- Design decision: UI components stay thin and the testable logic lives in
  pure modules, so tests run under the existing Node + `react-dom/server`
  setup with no new browser/jsdom dependency.
- Problems hit: `createElement(App, { recover })` failed to typecheck while
  `App` had a defaulted optional props parameter (overload inferred `Attributes`
  instead of the props type). Fixed by giving `App` a single non-optional
  `AppProps` parameter; `<App />` still renders since every prop is optional.
- Verified: 154 tests pass (14 new), typecheck and lint clean.

## Task 18 — Restored pane (sandboxed iframe)

- Implemented `src/ui/restored-pane-logic.ts` (pure):
  - `RESTORED_SANDBOX = 'allow-scripts'` — scripts run (for Ruffle and the
    interceptor) but the frame stays in an opaque origin with no
    `allow-same-origin`, no top navigation, and no form submission, so archived
    content cannot reach the Seance app or the archive session (R3.7, R9.2,
    design.md §8).
  - `buildRestoredSrcDoc(html)` injects a dependency-free click interceptor
    before `</body>`; it stops in-frame navigation and posts the clicked link's
    archive href to the shell.
  - `parseRestoredMessage(data)` validates the message shape and only returns a
    navigation intent when the href is a real archive URL (via
    `parseArchiveUrl`), so a stray or hostile message cannot steer the shell to
    an arbitrary live address (R3.8).
- Implemented `src/ui/RestoredPane.tsx`: a `<section>` labelled "Restored — the
  saved page" (voice.md themed + literal) with a sandboxed `<iframe srcDoc>`,
  an accessible title, `referrerPolicy="no-referrer"`, and a window `message`
  listener that calls `onNavigate` with the recovered original URL. Wired into
  `App`'s done phase so following a link re-runs recovery.
- Tests: `tests/ui/restored-pane-logic.test.ts` (sandbox policy tokens;
  interceptor injection with/without body; message parsing incl. rejecting
  non-archive hrefs) and `tests/ui/restored-pane.test.ts` (rendered iframe
  carries the sandbox attribute and srcdoc, no `allow-same-origin`, accessible
  title, pane label).
- Kiro features used: the `seance` spec (`requirements.md` R3.7/R3.8/R9.2,
  `design.md` §8), voice.md (pane labels), `structure.md` (ui/ delegates the
  URL decision to core via `parseArchiveUrl`).
- Problem hit: `react-dom/server` keeps camelCase attribute names (`srcDoc`,
  `referrerPolicy`) in static markup rather than the DOM's lowercase form, so
  the attribute-name assertions now compare case-insensitively.
- Verified: 164 tests pass (10 new), typecheck and lint clean.

## Task 19 — Reader pane + responsive layout

- Implemented `src/ui/ReaderPane.tsx`: labelled "Reader — a clean, readable
  version" (voice.md themed + literal). On a found article it renders the title
  and the sanitised Readability content (asset URLs already pointed at the
  archive by `extractReader`). On no article it shows the plain notice and
  leaves the restored page standing (R7.3).
- Layout in `theme.css`: `.panes` is one column by default with the reader
  first in the DOM, so it leads when the panes stack on a narrow screen; above
  `60rem` it becomes two columns (R7.2). `App`'s done phase now renders
  `ReaderPane` then `RestoredPane` inside `.panes`. The input row also goes
  single-column below `30rem` so it fits a 375px phone.
- Accessibility / motion: each pane is a labelled `<section>`, headings use a
  real hierarchy (h1 board → h2 pane → h3 article), and the global
  `prefers-reduced-motion` block (already in the theme) disables the loading
  pulse and transitions (N4).
- Tests: `tests/ui/reader-pane.test.ts` (3 cases: title + body render, empty
  title omitted, the no-article notice). The breakpoint and reduced-motion
  rules are CSS, verified by reading `theme.css` rather than asserted in a Node
  test — a `?raw` import of the stylesheet comes back empty under vite's test
  transform, so a string assertion there would be false comfort.
- Kiro features used: the `seance` spec (`requirements.md` R7.2/R7.3, N4,
  `design.md` §10), voice.md (pane labels, plain no-article copy),
  `structure.md` (reader pane consumes the dom-layer `ReaderResult`).
- Problem hit: CSS `?raw` imports resolve to empty strings in the vitest/vite
  pipeline, so I removed the stylesheet-content assertions and kept the
  behavioural render tests.
- Verified: 167 tests pass (3 new), typecheck and lint clean.

## Task 20 — Death certificate panel

- Implemented `src/ui/format.ts`: `formatCaptureDate(ts)` turns a 14-digit
  Wayback timestamp into a plain absolute date ("3 March 2008", no leading-zero
  day), with fixed month names so the output is deterministic and offline-
  testable. A malformed timestamp is returned unchanged rather than guessed.
- Implemented `src/ui/DeathCertificate.tsx` from a `RecoveryReport`:
  - "Died on (last working capture)" with the plain date, or "No working
    capture found" when there is none (R5.1).
  - Recovery shown as a number and a `role="meter"` with `aria-valuenow/min/max`
    and `aria-valuetext`, plus "2 of 4 assets recovered" (R5.2, R4.3).
  - A missing-asset tally that links to the grouped list below (`#missing-
    spirits`), grouped by kind via the pure `groupMissingByKind` (R5.3, R4.5).
  - Unknown assets reported separately with "not counted as recovered" (R4.4,
    honesty per R8.6).
  - A "Showing the capture from …" note only when the selected capture differs
    from the last working one (R5.4).
- Colour carries status (candle amber for recovery, cold grey-blue for missing)
  but never alone: every figure has text and the tally uses labelled dots.
  Wired above the panes in `App`'s done phase.
- Tests: `tests/ui/format.test.ts` (3 cases) and
  `tests/ui/death-certificate.test.ts` (7 cases: date, percent + meter aria,
  missing count + link + grouped URL, unknown reported separately, selected-vs-
  last note, no-working-capture wording, and a clean 100% certificate with no
  missing list).
- Kiro features used: the `seance` spec (`requirements.md` R4.3/R4.4/R5.1–R5.4,
  `design.md` §6), voice.md (themed + literal labels, absolute dates, honest
  "unknown"), the pure core (`groupMissingByKind`).
- Problem hit: none. 177 tests pass (10 new), typecheck and lint clean.

## Task 21 — Status banners for all error states

- Implemented `src/ui/status-banner.ts` (pure): `statusContent(status)` returns
  a `{ tone, title, detail, nextStep?, retryable }` for every design.md §11
  state — invalid URL, no captures, no working capture (with the best-effort
  date), slow, rate limited (with a countdown), timeout, outage, network,
  partial (recovered vs missing counts), Flash missing, and Ruffle failure. The
  copy is lifted from voice.md: what happened, why, and what to do next, never
  blaming the visitor.
- Implemented `src/ui/StatusBanner.tsx`: renders that content with a tone
  colour on the left border, `role="alert"`/`aria-live="assertive"` for error
  tones and `role="status"`/polite otherwise, and a "Try again" control only
  for retryable states. Colour never carries meaning alone; the title and
  detail always state it.
- Wired into `App`: the error phase renders a banner mapped from the recovery
  error kind (retry re-runs the same URL); the done phase shows a partial
  banner above the certificate whenever recovery is below 100%. Removed the
  temporary `.placeholder` screen and its style.
- Tests: `tests/ui/status-banner.test.ts` (11 cases): every §11 state has a
  non-empty title and detail, plus the specific wording and next step for no
  captures, no working capture + fallback date, rate-limit countdown, outage
  (alert + "not your address" + retry), partial counts, Flash missing, Ruffle
  failure, and that the retry control appears only for retryable states.
- Also ran `npm run build`: the full UI compiles to a static bundle
  (index.html + one CSS + one JS chunk), confirming the browser-only pieces
  (`DOMParser`/`XMLSerializer` in `recover.ts`, the CSS import) are sound.
- Kiro features used: the `seance` spec (`requirements.md` R8.1–R8.6, R1.2,
  R6.3, R6.5, R2.3, `design.md` §11), voice.md (every example error string),
  `structure.md` (banner copy kept pure and separate from the component).
- Problem hit: none. 186 tests pass (9 new), typecheck, lint, and build clean.

## Task 22 — End-to-end wiring with fixtures

- Added `tests/integration/recover-flow.test.ts`: it drives the whole pipeline
  offline from a new fixture (`tests/fixtures/html/dead-home.html`) through a
  single `fetch` mock that answers `/api/cdx` and `/api/snapshot`. It covers
  input (`interpretUrlInput`/`resolvedUrl`) → clients → capture selection →
  document rewrite → asset status → recovery report → reader → Flash, then
  renders `DeathCertificate`, `ReaderPane`, and `RestoredPane` from the view and
  asserts the visible result (3 of 5 assets recovered, 60%, the missing image
  named, archive-only URLs, a sandboxed iframe that loads Ruffle).
- Finished the deferred runtime wiring:
  - **Ruffle in the restored view.** The restored page renders in a sandboxed
    iframe, so Ruffle must run *inside* that frame. `src/dom/flash.ts` gained
    `applyFlashNotices`, which the pipeline runs before serialising: it replaces
    confirmed-missing `<object>/<embed>` `.swf` with the plain "not saved"
    notice and leaves recovered/undetermined embeds for Ruffle. `recover.ts`
    computes `view.hasFlash`; `RestoredPane` injects the Ruffle loader into the
    iframe `srcdoc` only when there is a playable embed
    (`buildRestoredSrcDoc(html, { ruffleScriptUrl })`). Ruffle's source defaults
    to the official build and is overridable for self-hosting.
  - **Local end-to-end on localhost.** Added `api/router.ts` (one host-agnostic
    entry point dispatching `/api/cdx` and `/api/snapshot`) and a dev-only Vite
    middleware in `vite.config.ts` that serves the proxies alongside the app via
    `server.ssrLoadModule`, so `npm run dev` works end to end without a second
    process. The router is unit-tested offline (`tests/api/router.test.ts`); the
    Node↔Web adapter in the plugin is dev-only and exercised by hand.
- New unit tests: `applyFlashNotices` status handling (`tests/dom/flash.test.ts`)
  and Ruffle injection in `tests/ui/restored-pane-logic.test.ts`.
- Spec changes: `design.md` §8 now matches the opaque-origin `allow-scripts`
  sandbox the code uses, and §9 is rewritten to describe Ruffle running inside
  the iframe (pipeline replaces missing embeds; the pane loads Ruffle). Added
  `api/router.ts` to `structure.md`.
- Kiro features used: the `seance` spec (`design.md` §3/§8/§9, `requirements.md`
  R3.7/R6.1–R6.3/R9.1/R9.2), steering (`structure.md` layout, `tech.md`
  serverless-function model, `voice.md` Flash copy), and the recorded-fixture
  offline test story from `tech.md`.
- Problem hit: under `noUncheckedIndexedAccess` a `vi.fn()` with no declared
  args types its `mock.calls[0]` as an empty tuple, so indexing failed to
  typecheck; captured the called URL in a local variable instead.
- Verified: 197 tests pass (11 new), typecheck, lint, and build clean.

## Task 23 — Theme + accessibility pass

- `theme.css` was already applied in the Phase 4 tasks; this pass verified and
  locked its accessibility properties rather than restyling. Reviewed the
  stylesheet and confirmed: colour always rides alongside text (recovery meter
  has a percent and `aria-valuetext`; the asset tally labels each dot in words;
  banner tone never stands alone), a `prefers-reduced-motion` block disables the
  loading pulse and all transitions (N4), `:focus-visible` gives a candle-amber
  outline, and the skip link is keyboard reachable. No third-party logos or
  images anywhere (R9.3).
- Added `tests/ui/accessibility.test.ts` (8 cases) as the automated structural
  a11y check: skip link targets `#main`, the URL field has a real `<label>` and
  the submit an `aria-label`, each themed label is paired with its literal
  meaning (Restored / Reader / Death certificate), the recovery meter carries
  `role="meter"` + `aria-valuenow`/`aria-valuetext`, status is stated in words
  next to the coloured dots, error banners are `role="alert"`/assertive while
  quieter states are `role="status"`/polite, and the main view uses no `<img>`.
- Kiro features used: the `seance` spec (`requirements.md` R9.3, N4),
  `voice.md` (themed+literal labels, colour-carries-information rule),
  `structure.md` (pure banner/label logic kept testable). The spec needed no
  change.
- Problem hit: no DOM-based axe run is possible under the Node + react-dom/server
  test setup, so the automated check asserts ARIA/landmark structure directly; a
  full browser axe sweep and a manual keyboard walk are recorded as browser-only
  checks in the README (task 25).
- Verified: 205 tests pass (8 new), typecheck, lint, and build clean.

## Task 24 — Attribution + privacy review

- Expanded the footer into an "About and credits" region that names the Internet
  Archive Wayback Machine and the Ruffle project in plain text, states the
  privacy posture to the visitor (no account, no saved history, nothing stored
  on the server), and repeats the no-marks/no-endorsement line (R9.3, R9.4,
  R9.5).
- Code review of the privacy and attribution requirements:
  - **Clients call only our own origin.** `grep` confirms `src/archive/*`
    builds relative `/api/cdx` and `/api/snapshot` paths and never references
    `archive.org` (R9.1).
  - **Proxies talk only to the archive.** The only upstream host in `api/` is
    `https://web.archive.org` (CDX endpoint in `api/cdx.ts`; the snapshot URL
    comes from `src/core/archive-url.ts`, whose `ARCHIVE_HOST` is
    `web.archive.org`).
  - **Nothing is persisted.** No `fs`, database, cache store, cookie, or web
    storage in `api/`; the functions take a `Request` and return a `Response`
    (R9.5).
  - **No third-party marks in the UI.** No `<img>` and no image/logo/trademark
    asset anywhere under `src/` (R9.3).
  - **One external runtime contact, documented.** The restored iframe loads the
    Ruffle runtime from `unpkg.com/@ruffle-rs/ruffle` (a static script, no user
    data). It is overridable with a self-hosted URL, which removes even that
    contact; noted in the README deploy section.
- Added `tests/ui/credits.test.ts` (4 cases) to guard the credits text, the
  no-endorsement/no-marks rule, the stated privacy posture, and the no-image
  rule.
- Kiro features used: the `seance` spec (`requirements.md` R9.1/R9.3/R9.4/R9.5),
  `voice.md` (plain-text credits, no marks). No spec change needed.
- Problem hit: none. 209 tests pass (4 new), typecheck, lint, and build clean.

## Task 25 — Manual verification against real archive

- No browser available here, so I verified the data the pipeline depends on with
  11 one-shot CDX requests against the live Wayback Machine (sequential, with
  pauses, well under the 30-request budget), and recorded the results in the
  README "Manual verification against the live archive" section.
- Findings:
  - **Dead page with good captures:** `http://www.geocities.com/Athens/` has
    HTTP 200 captures from 22 Oct 1996 to 17 Oct 2000; everything after is a
    301 redirect, so Seance's most-recent-200 rule yields a real "Last working
    capture: 17 October 2000".
  - **Archived .swf:** `http://www.homestarrunner.com/intro.swf` has HTTP 200
    captures at `20040325185740` and `20060626144354`, so Ruffle has a real
    archived movie to play (raw URL
    `https://web.archive.org/web/20060626144354id_/http://www.homestarrunner.com/intro.swf`).
  - **Outage state, observed live:** the CDX API intermittently returned an
    Internet Archive "Temporarily Offline" HTML page instead of JSON during the
    session — the exact archive-side failure the app reports (R8.4), and a
    confirmation that the proxy's non-JSON parse guard matters in practice.
- The browser-only checks (assets visibly loading from the archive, Ruffle
  actually playing the .swf, 375px reader legibility, each error state in the
  UI, an axe/keyboard sweep) are listed as an unchecked human checklist in the
  README.
- Spec/requirements finding: a broad `matchType=prefix` regex filter for `.swf`
  returned nothing, while exact-URL CDX queries are reliable. This matches the
  existing design (per-asset exact-URL lookups in `capture-lookup.ts`), so no
  code change was needed; noted in the README.
- Kiro features used: the `seance` spec (`requirements.md` R2/R3/R5/R6/R8), and
  `voice.md` (absolute dates, never claim success that is unverified — the .swf
  playback is left unchecked for a human, not asserted).
- Problem hit: the live archive went into a temporary outage mid-session; I
  paused and spaced the remaining requests, and used the outage itself as a real
  data point rather than retrying hard.
- Verified (data, not browser): 209 tests still pass, typecheck clean.

## Task 26 — Expand README + deploy config

- Rewrote `README.md`: dropped the "planning phase" stub and documented what the
  app does, the real stack, run/build/test/lint scripts, local development with
  the api proxy middleware, deploying to Vercel (free tier) with a note on
  self-hosting Ruffle, the offline fixture-based test story and the property
  tests, the Kiro workflow (steering + spec + hook + agent + the build log), and
  the project layout. The task-25 "Manual verification against the live archive"
  section and its browser-only checklist are preserved.
- Added the deploy config:
  - `vercel.json` (Vite framework, build command, output directory).
  - `api/cdx.ts` and `api/snapshot.ts` each declare
    `export const config = { runtime: 'edge' }`, so Vercel deploys them as Edge
    Functions. They already use only Web-standard `Request`/`Response`, `fetch`,
    `URL`, and `AbortController`, so no code change was needed to run on Edge.
  - Removed the `export default` from `api/router.ts` so Vercel's file-based
    routing does not expose the dev-only router helper as a function; the Vite
    middleware and tests use the named `handleApiRequest`.
- Did not deploy (per instructions): no `vercel` invocation, no remote created.
- Kiro features used: the `seance` spec (`tasks.md` task 26, `tech.md` free
  static host + stateless functions, N3), `structure.md` (layout section),
  `voice.md` (plain copy). No spec change needed beyond the docs updated in
  earlier tasks.
- Problem hit: `vercel.json`'s `functions.<path>.runtime` does not accept the
  string `"edge"` (that field is for named runtime packages); the Edge runtime
  is selected by the in-file `export const config` instead, so `vercel.json`
  keeps only framework/build/output.
- Verified: 209 tests pass, typecheck, lint, and build clean.


## Task 27 — Keep the restored page on the restored document (fix round)

- Bug: the Restored iframe went blank. `http://www.geocities.com/Athens/`
  rendered then blanked after a few seconds; `http://www.homestarrunner.com/`
  showed an empty white area.
- Root cause: three paths let the archived document leave the restored view.
  (1) A `<meta http-equiv="refresh">` ("you will be automatically redirected")
  navigated the sandboxed frame to its target, which failed and blanked the
  pane. (2) `<frame src>` inside framesets was not in the rewrite set, so frames
  fetched the dead origin and showed blank. (3) Some archived pages carry a
  `<meta>` Content-Security-Policy that blocks archive-served assets and the
  injected interceptor.
- Fix (`src/dom/rewrite-document.ts`, `src/ui/restored-pane-logic.ts`):
  - `neutraliseMetaRefresh` removes the refresh meta and, when it named a
    target, rewrites that target to the archive and prepends a plain notice with
    a link the click interceptor turns into a fresh recovery.
  - `neutraliseMetaCsp` strips archived `<meta>` CSP (the sandbox is the real
    trust boundary).
  - Added `frame[src]` to the rewrite/collect rules (kind `other`).
  - Added `NAVIGATION_GUARD_SCRIPT`, injected into the iframe srcdoc: it cancels
    form submissions and neutralises `window.open`. Top navigation is already
    denied by the sandbox token list.
- Spec: added R3.9–R3.11; design §7 (meta/frame handling) and §8 (navigation
  guard); tasks.md task 27.
- Tests (offline): `tests/dom/restored-navigation.test.ts` with a new fixture
  `redirect-frameset.html` — asserts the refresh/CSP metas are gone, a notice
  links to the archive, frames are archive URLs, and the srcdoc carries the
  guard. Wrote the test first (6 failing), then implemented.
- Kiro features used: the `seance` spec drove the requirement IDs; the
  structure steering kept URL decisions in core and DOM work in `src/dom`.
- Verified: `npm run typecheck` clean; full suite 215 passing.


## Task 28 — Honest asset accounting (fix round)

- Bug: on `http://www.geocities.com/Athens/` the certificate said "3 of 3
  assets recovered, 100%" while the restored page showed a broken image icon.
- Root cause: GeoCities-era pages put images in legacy presentational
  attributes — `background` on `body`/`table`/`td` and `<input type=image
  src>`. These were not in the rewrite/collect set, so such an image was never
  rewritten to the archive (it stayed pointed at the dead origin and showed
  broken) and never entered the recovery report, leaving the honest-but-partial
  count reading as a full 100%.
- Fix (`src/dom/rewrite-document.ts`): added two rules — `[background]`
  (body/table/tr/td) and `input[src]`, both image assets. They go through the
  same core rewriter and asset collection as every other reference, so a
  background image with no status-200 capture is now rewritten to the archive
  and reported `missing`; only a real 200 capture counts as recovered
  (`resolveAssetStatuses` already enforced that).
- Spec: design §7 attribute list now names the legacy attributes; tasks.md
  task 28. Behaviour is covered by existing R4.1–R4.4 and R3.4.
- Tests (offline): `tests/dom/legacy-assets.test.ts` with new fixture
  `legacy-assets.html` — one working image of five gives 20%, and the
  background images report missing. Wrote the test first (3 failing), then
  implemented.
- Verified: `npm run typecheck` clean; full suite 218 passing.


## Task 29 — Do not call a recently-live site dead (fix round)

- Bug: `homestarrunner.com` still answers today (last capture two days ago) yet
  the certificate read "Died on 17 November 2026".
- Root cause: the certificate always framed the last working capture as a death
  date, with no check for how recent that capture is.
- Fix: new pure module `src/core/liveness.ts` — `classifyLiveness(timestamp,
  nowMs)` returns `recentlyAlive` when the last working capture is within
  `RECENTLY_ALIVE_DAYS` (30). `now` is injected so the module stays pure. The
  `DeathCertificate` takes an optional `now` prop (defaults to `Date.now()`) and
  renders "Still answering recently. Last saved copy: <date>." plus a nudge to
  pick an older capture, instead of a death date, when the site is recent.
- Spec: design §6 (liveness rule under R5.1); tasks.md task 29.
- Tests (offline): `tests/core/liveness.test.ts` (boundary at 30 days,
  malformed/null timestamp) and new `DeathCertificate` cases with an injected
  `now` (recent → alive copy, old → death date). Wrote tests first, then
  implemented.
- Verified: `npm run typecheck` clean; full suite 224 passing.


## Task 30 — Capture picker for older captures (fix round)

- Bug: no way to open an older capture. Archived Flash on homestarrunner only
  exists in 2004–2006 captures, but the app always used the newest, so the
  `.swf` could never be shown with Ruffle.
- Fix:
  - Core: `selectByTimestamp(captures, ts)` (pure) returns the exact capture.
  - Pipeline: `recover(url, deps, { timestamp })` opens a chosen capture instead
    of the newest working one, and the recovery view now carries `captures`
    (the de-duplicated, newest-first list) for the picker.
  - UI: `src/ui/capture-picker-logic.ts` (`groupCapturesByYear`, pure) and
    `src/ui/CapturePicker.tsx` — two native `<select>` controls (year, then
    saved date) and an "Open this copy" button. Native controls keep it
    keyboard operable; CSS stacks the controls full-width under 30rem (375px).
  - App wires the picker's `onPick` to re-run recovery for the same URL at the
    chosen timestamp.
- Spec: design §5 (`selectByTimestamp`, grouping); tasks.md task 30; R2.4.
- Tests (offline): `capture-picker-logic.test.ts` (grouping + `selectByTimestamp`)
  and `capture-picker.test.ts` (renders years/dates, hides itself for a single
  capture). Wrote tests first, then implemented.
- Verified: `npm run typecheck` clean; full suite 230 passing.


## Task 31 — Fix "how it works" step number/text overlap (fix round)

- Bug: on the home page the numbered circle overlapped the first word of each
  step's text.
- Root cause: `.steps li` had `padding-left: var(--s-6)` (2rem), but the
  numbered circle `.steps li::before` sits at `left: var(--s-4)` (1rem) and is
  1.4rem wide, so its right edge is at 2.4rem — 0.4rem past where the text
  began.
- Fix (`src/ui/theme.css`): raise the item's left padding to `var(--s-7)` (3rem)
  so text starts clear of the circle (0.6rem gap) at any width.
- Spec: tasks.md task 31 (voice.md visual rules).
- Tests (offline): `tests/ui/steps-layout.test.ts` parses theme.css, resolves
  the spacing tokens, and asserts `.steps li` left padding ≥ the circle's
  `left + width`. Wrote the guard first (failing at 2 < 2.4), then fixed.
- Verified: `npm run typecheck` clean; full suite 231 passing; lint clean.


## Task 32 — Cut archive traffic per recovery (rate-limit fix round)

- Bug: after a couple of recoveries the live archive returned HTTP 429. A single
  recovery fired one CDX request per referenced asset (one page referenced 49),
  each with its own retry/backoff, so the browser made dozens of archive
  requests and the proxy itself took ~16s to report a 429.
- Root cause: `createCaptureLookup` queried the CDX proxy once per asset URL,
  with no cap, concurrency of 6, and no caching.
- Fix (traffic reduction only; the time bound and progress are tasks 33–34):
  - Asset-check cap (R8.7): `resolveAssetStatuses` now takes `{ maxChecked }`.
    It checks at most `DEFAULT_MAX_CHECKED_ASSETS` (4) distinct assets, chosen
    by kind priority (stylesheet, script, Flash, then image, media, other), and
    marks every unchecked asset `unknown` — never recovered (R4.4, R8.6). Omit
    the option to check all (keeps the asset-status unit tests and the e2e flow,
    which lifts the cap to 10, intact).
  - Concurrency: `createCaptureLookup` default dropped from 6 to 2.
  - Session CDX cache (R8.8): new `src/archive/cdx-cache.ts` (`createCdxCache`);
    `fetchCaptures` serves a repeated URL from an injected cache and stores only
    successful lookups (a transient error stays retryable). The browser shares
    one cache across recoveries via a module singleton in `browserRecoverDeps`,
    so re-recovering a page or following a link back to it makes no new CDX
    request. The proxy-side cache is task 33's change set-up; this task is the
    client side.
  - Net effect: for a typical page the recovery makes the page CDX (1) + the
    snapshot (1) + at most 4 asset CDX = ≤6 archive requests, down from dozens.
- Spec: requirements R8.7/R8.8; design §3 step 6 and new §3.1; tasks.md task 32.
- Tests (offline, written first): `tests/archive/cdx-cache.test.ts` (cache hit,
  per-URL miss, errors not cached), `tests/dom/asset-status-cap.test.ts`
  (priority + cap → unknown), a concurrency guard in
  `tests/archive/capture-lookup.test.ts` (≤2 in flight), and
  `tests/ui/recover-traffic.test.ts` (≤6 requests for a 13-asset page; a second
  recovery makes no new CDX request).
- Verified: full suite 241 passing; typecheck and lint clean.


## Task 33 — Bound the total wait, surface rate-limited/slow fast (fix round)

- Bug: `curl /api/cdx` took ~16s to report a 429, and the app spun for 75+
  seconds on one static line and never showed the rate-limited banner.
- Root causes:
  - The proxy's default retry (3 attempts, up to 8s backoff each) meant a
    sustained 429 took ~16s to surface.
  - The browser made no overall time bound: a slow/aborted asset phase could
    keep the UI "running" indefinitely, and asset-lookup failures were swallowed
    to `unknown`, so the rate-limit never reached a banner.
- Fix:
  - Overall deadline (R8.9): `recover` creates one `DeadlineHandle` (default 20s,
    injectable for tests) and threads its `AbortSignal` into every archive fetch
    via `ArchiveClientDeps.signal`. The timer is always cleared in a `finally`.
    An abort during the main CDX or snapshot fails the recovery with `timeout`;
    an abort during the asset phase just leaves the rest `unknown` and renders
    the partial page (R8.5).
  - Abort mapping: `errorFromThrow` now maps an `AbortError` to the `timeout`
    client error (was `network`), so the shell shows the timeout state.
  - Proxy retry worst-case cut (`DEFAULT_RETRY_OPTIONS`): 6s timeout, 2 attempts,
    ≤2s backoff ceiling (and `Retry-After` capped to it). Worst case 14s; a
    sustained 429 surfaces in ~2s. Existing proxy tests pass their own fast
    options, so they were unaffected.
  - Proxy CDX cache (R8.8, proxy side): `createCdxMemoryCache` (TTL, injectable
    clock); `handleCdxRequest` serves a repeated URL from it and caches only
    successful upstreams. Isolated the existing handler tests with a fresh cache
    each so the process-wide default does not couple them.
  - Retry controls: the `rate-limited`, `timeout`, `outage`, and `network`
    banners are now all retryable, so every archive-side failure offers "Try
    again" (voice.md: the rate-limited copy now names the next step).
- Spec: requirements R8.9; design §3.1 (deadline) and §11 (timeout/retry
  policy); tasks.md task 33.
- Tests (offline, written first): `tests/archive/deadline-signal.test.ts`
  (signal passed to fetch; abort → timeout), `tests/ui/recover-deadline.test.ts`
  (aborted deadline → timeout, timer cleared, no hang), `tests/api/cdx-cache.test.ts`
  (proxy cache hit; errors not cached), a `DEFAULT_RETRY_OPTIONS` worst-case
  bound in `tests/api/http.test.ts`, and retryable assertions in
  `tests/ui/status-banner.test.ts`.
- Verified: full suite 250 passing; typecheck and lint clean.


## Task 34 — Show progress while waiting (fix round)

- Bug: during a recovery the shell showed one static line ("Holding the
  seance. Searching the Internet Archive…") for the whole wait, so a slow run
  looked hung.
- Fix:
  - New pure module `src/ui/progress.ts`: the `RecoveryStep` union, the
    `RECOVERY_STEPS` order, and `recoveryStepLabel` — plain lines for each step
    (contacting, retrieving, rebuilding, checking, reading).
  - `recover` takes `options.onProgress` and calls it as it enters each step.
  - The shell's `running` phase now carries the current `step`; `App` passes an
    `onProgress` that updates the phase (guarded by the run id so a superseded
    run cannot overwrite a newer one's line) and renders `recoveryStepLabel`
    with the URL beneath it.
- Spec: requirements R8.10; design §3.1 (progress note); tasks.md task 34.
- Tests (offline, written first): `tests/ui/progress.test.ts` (labels +
  order) and `tests/ui/recover-progress.test.ts` (a successful recovery reports
  every step in order through `onProgress`).
- Verified: full suite 254 passing; typecheck, lint, and `npm run build` clean.

### Re-check in the browser once the rate limit clears
These need a real browser against the live archive (listed so the human
verifier knows what changed):
- Recover a busy page (e.g. a GeoCities page with many images): the death
  certificate reports a handful of `unknown` assets rather than hanging, and
  the network panel shows only a few `/api/cdx` calls (≤6 total for a typical
  page), not dozens.
- Trigger rate limiting (recover a few pages quickly): the rate-limited banner
  appears within a few seconds with a "Try again" control, instead of spinning;
  a second recovery of the same URL makes no new `/api/cdx` request (served
  from the session cache).
- Watch the progress line change through the steps (reaching the archive →
  retrieving → rebuilding → checking assets → reader) instead of one static
  line.
- Confirm the whole recovery finishes or fails within ~20s even when the
  archive is slow, and that the earlier fixes (27–31) still hold.


## Task 35 — Play archived Flash through a CORS proxy (browser-test fix)

- Bug (Chrome, live archive): the 2005 homestarrunner capture rendered but
  Ruffle showed its own error — "Ruffle failed to load the Flash SWF file.
  Access to fetch has likely been blocked by CORS policy." The restored iframe
  is `srcdoc` + `sandbox="allow-scripts"` (opaque origin "null"), and
  web.archive.org sends no CORS headers for the raw `id_` `.swf`, so Ruffle's
  cross-origin fetch was blocked.
- Fix:
  - New serverless proxy `api/swf.ts`: `?url=<archive .swf>` → fetches ONLY from
    `web.archive.org` (any other host → 400, so it is not an open proxy) under
    the shared `fetchWithRetry` timeout/retry policy, and relays the bytes with
    `access-control-allow-origin: *` and a Flash content type (a generic
    upstream `application/octet-stream` is mapped to
    `application/x-shockwave-flash`). Stateless. Registered in `api/router.ts`
    (`/api/swf`); deploys as a Vercel Edge function from the file like the other
    proxies (Vercel auto-detects `api/*.ts`, consistent with `cdx`/`snapshot`).
  - New pure `src/core/swf-proxy.ts`: `buildSwfProxyUrl`/`parseSwfProxyUrl`/
    `isSwfProxyUrl`. The proxy URL carries the archive URL in its `url` param, so
    confinement (R3.4/I2) holds through the proxy; the parser only accepts a
    target that is an archive URL.
  - `src/dom/rewrite-document.ts` now also confines Flash `<param name="movie|src">`
    values to the archive (the common `<object>` movie shape), so a param-driven
    movie no longer points at the dead origin.
  - New `src/dom/rewrite-swf.ts` `rewriteSwfToProxy(doc, proxyBase)` wraps the
    remaining (playable) archive `.swf` `object[data]`/`embed[src]`/
    `param[name=movie|src]` values with an absolute app-origin proxy URL. It
    runs in `recover` after `applyFlashNotices`; `browserRecoverDeps` injects
    `swfProxyBase = window.location.origin + /api/swf`. An absolute URL is used
    because a relative one is unreliable from an opaque-origin srcdoc.
- Spec: R6.6 (+R6.1, R6.2, R9.1); design §9.1; tasks.md task 35.
- Tests (offline, first): `tests/core/swf-proxy.test.ts`,
  `tests/api/swf.test.ts`, `tests/dom/rewrite-swf.test.ts`, a `/api/swf` route
  case in `tests/api/router.test.ts`, and an end-to-end proxy-routing assertion
  in `tests/integration/recover-flow.test.ts`.
- Live check (allowed one-shots): ran the proxy handler with real `fetch`
  against `web.archive.org` for `.../welcome.swf` — HTTP 200,
  `access-control-allow-origin: *`, 16124 bytes beginning `CWS` (a compressed
  SWF); a non-archive host returned 400 with no fetch.
- Verified: full suite 269 passing; typecheck and lint clean.


## Task 36 — One capture entry per day in the picker (browser-test fix)

- Bug (Chrome): the saved-date list repeated the same day several times (three
  "17 November 2026"), because the picker listed every capture and a busy day
  has many captures.
- Fix: new pure `collapseCapturesByDay` in `src/ui/capture-picker-logic.ts`
  keeps one capture per calendar day, preferring a working (status-200) capture
  for the day (and the most recent among those), else the most recent of any
  status; days stay newest-first. `groupCapturesByYear` now collapses by day
  first, so the picker's native, keyboard-operable date list shows each date
  once. Capture selection consistency holds: the default selected capture (most
  recent 200) is the collapsed representative of its day, and every pickable
  option is a collapsed capture.
- Spec: R2.6; design §5; tasks.md task 36.
- Tests (offline, first): `collapseCapturesByDay` cases (prefer 200, fall back
  to most recent, keep separate days newest-first) and a year-grouping case
  asserting a day is not repeated, in `tests/ui/capture-picker-logic.test.ts`.
- Verified: full suite 273 passing; typecheck and lint clean.


## Task 37 — Certificate never crashes; error boundary around the panels (browser-test fix)

- Bug (Chrome): a render error from `<DeathCertificate>` ("The above error
  occurred in the <DeathCertificate> component") blanked the whole result while
  switching captures.
- Root cause: the component read `.timestamp` off the selected/last-working
  capture after a `!== null` check only. A battery render over edge inputs
  confirmed it throws when a capture is `undefined` (not just `null`) or when
  the report has no `assets` array — the `!== null` guard lets `undefined`
  through to `selectedCapture.timestamp`.
- Fix:
  - `DeathCertificate` now coalesces an absent selected/last-working capture
    (null or undefined) to `null`, defaults a missing `assets` array and the
    numeric totals, and guards the "showing the capture from" lines on a present
    capture. An absent last-working capture reads "No working capture found"
    rather than throwing (R5.5).
  - New `src/ui/ResultErrorBoundary.tsx`: a class error boundary plus a plain
    `ResultErrorFallback` (voice.md: names the fault as ours, not the address,
    offers "Try again"). `App` wraps the whole result section in it with a retry
    that re-runs recovery, so any panel render error shows the plain message
    instead of a blank page. Styles added to `theme.css` (cold/ember accent,
    keyboard-operable button).
- Spec: R5.5; design §6; tasks.md task 37.
- Tests (offline, first): `tests/ui/death-certificate.test.ts` reproduces the
  throwing inputs (undefined last-working, missing selected, absent assets) and
  asserts no throw + the plain fallback; `tests/ui/error-boundary.test.ts`
  covers `getDerivedStateFromError`, children passthrough, and the fallback
  render with retry.
- Verified: full suite 280 passing; typecheck and lint clean.


## Task 38 — Tiny-embed Ruffle failure degrades to a plain notice (browser-test fix)

- Bug (Chrome): the secondary `main_nav.swf` is 10px tall; when Ruffle failed
  it drew a clipped red error strip inside the embed. (Task 35 fixes the CORS
  load failure that triggered it; this hardens the residual-failure path.)
- Fix (in `src/ui/restored-pane-logic.ts`, injected into the restored iframe
  only when the page has playable Flash):
  - `RUFFLE_CONFIG_SCRIPT`, injected BEFORE the Ruffle loader so the polyfill
    reads it, sets `warnOnUnsupportedContent:false` (the clipped warning strip),
    plus `contextMenu:false`, `unmuteOverlay:"hidden"`, `splashScreen:false`,
    and `autoplay:"on"` for recovered movies.
  - `RUFFLE_ERROR_GUARD_SCRIPT` listens for an `error` event from a polyfilled
    Ruffle element (`<ruffle-*>`) and replaces it with the plain voice.md notice
    (`FLASH_ERROR_MESSAGE`, single-sourced from `src/dom/flash.ts`) rather than
    leaving a broken strip (R6.7, R6.5).
- Spec: R6.7 (+R6.5); design §9.2; tasks.md task 38.
- Tests (offline, first, in `tests/ui/restored-pane-logic.test.ts`): the built
  srcdoc (with Flash) sets `RufflePlayer.config` with `warnOnUnsupportedContent`
  before the loader, installs an `error` listener, and carries the plain notice
  text; a no-Flash page injects neither.
- Note: the full in-browser behaviour (an actual Ruffle panic replaced by the
  notice) is browser-only, like the other Ruffle checks; the test pins the
  injected contract.
- Verified: full suite 283 passing; typecheck, lint, and `npm run build` clean.


## Phase 9 — Restored-render / accounting / copy fix round

Found by a human re-testing the running app (Chrome) against the live Internet
Archive. Before touching code I confirmed the data with a few one-shot CDX/HEAD
requests against the live archive (no browser, within the 10-request budget):
`www.geocities.com/Athens/` references one script and two 1×1 tracking pixels
(`visit.geocities.com/visit.gif`, `geo.yahoo.com/serv?s=76000424&t=971786877`);
both pixels *do* have status-200 captures, but at timestamps far from the page
(visit.gif next-day, serv only in 2011), so the page-timestamp `id_` URL
returns HTTP 302 at render time while CDX accounting still finds a 200. That
mismatch — recovered per CDX, broken at render — is the root of issue 1.

Spec first for the whole round: requirements R3.12–R3.14 and R4.6, design §8.1
(the in-frame injected scripts) plus the recovered-means-200 note in §6, and
tasks 39–42. One commit per task; a failing test first; full suite + typecheck
+ lint + build green after each.

### Task 39 — Honest accounting + robust restored images

- Accounting (R4.6): `dom/asset-status.resolveAssetStatuses` already counts only
  a status-200 capture as recovered (`selectBest` filters to 200, so a
  redirect-only asset resolves to no working capture → missing). Pinned it with
  a new test feeding the lookup 3xx captures and asserting `missing` + no
  `archiveUrl`.
- Restored view (R3.13): new `IMAGE_GUARD_SCRIPT` injected into the iframe
  (`src/ui/restored-pane-logic.ts`). Capture-phase `load`/`error` listeners plus
  an initial scan: an image that loads at 1×1/0×0 (a tracking pixel) is hidden;
  an image that fails to load is replaced with a small placeholder
  (`data-seance-img`) carrying the single-sourced `RESTORED_IMAGE_PLACEHOLDER_TEXT`,
  instead of the browser's broken-image icon.
- Tests (first): `tests/dom/asset-status.test.ts` redirect case;
  `tests/ui/restored-pane-logic.test.ts` asserts the srcdoc carries the
  `naturalWidth` check, an `error` listener, `data-seance-img`, and the
  placeholder text.
- Note: the certificate percent is computed from CDX, so it cannot see a
  runtime 302; the image guard is the honest runtime remedy the brief asked for
  (hide pixels, placeholder for broken images). Design §6/§8.1.

### Task 40 — Scale fixed-width pages to fit the pane

- `FIT_TO_WIDTH_SCRIPT` injected into the iframe (R3.12): measures
  `documentElement.scrollWidth` against the frame's `innerWidth` and, when
  wider, scales `body` down with `transform: scale(k)` (top-left origin,
  compensating width), `k = min(1, vw/sw)` so it only shrinks, re-measured on
  `resize` and `load`. `transform` (not `zoom`) keeps Flash and links
  interactive; no transition, so no motion.
- Tests (first): the built srcdoc carries `scrollWidth`, an `resize` listener, a
  `scale(` transform, and `Math.min(1`.

### Task 41 — Style the injected notices

- `NOTICE_STYLE` injected into the iframe head (R3.14), with a body-end fallback
  via the new `injectIntoHead` helper (replacing the old `injectRuffle`). Rules
  for `[data-seance-refresh]`/`[data-seance-flash]`/`[data-seance-img]`: own dark
  background, light ink, candle-amber accent, sans-serif face — literal colours,
  since the archived document has no access to the app's theme.css. The notices
  now read on light or dark archived pages instead of default serif.
- Tests (first): the srcdoc contains a `<style>` in the head with the three
  notice selectors and a background/font.

### Task 42 — Copy polish (anti-slop)

- Replaced the em-dash subtitle clause on the Death certificate, Reader,
  Restored, and capture-picker headings with a plain literal subtitle on its own
  line (voice.md themed+literal pairing kept, the em dash dropped). Renamed the
  `__literal` CSS classes to `__subtitle`.
- Re-read the rendered UI strings: no hype words (grep clean), the only
  remaining em dash is in a source comment, not rendered.
- Tests (first): new `tests/ui/copy.test.ts` asserts each panel renders its
  themed heading and literal subtitle and no rendered em dash; updated the three
  existing tests that asserted the old lowercase em-dash substrings.

### Re-check in a browser (needs a human; `npm run dev`, no server started here)

- `http://www.geocities.com/Athens/`: the two 1×1 pixels are hidden (no broken
  icon); any image that still fails shows the styled "not recovered" placeholder
  rather than the browser glyph; confirm the certificate count reads honestly
  against what is shown.
- A wide fixed-layout page (and `homestarrunner.com`'s 550px Flash stage) fits
  the Restored pane at 375px and in the ~546px desktop pane, with Flash still
  clickable; resize the window and confirm it rescales.
- The stopped-redirect note, Flash "not saved" notice, and the image
  placeholder render as styled boxes (dark panel, amber accent) on both a light
  and a dark archived page, not default serif.
- Headings read "Death certificate / Reader / Restored / Reach an older copy"
  each with a plain subtitle line beneath, no em dash.
- Re-run the earlier error-state and accessibility/keyboard checks; nothing in
  this round changed those paths.


## Phase 10 — Polish, MCP server, write-up

Spec first for the whole phase (requirements R3.12 extended, R4.7 added, R7.3
extended; design §6/§7/§8.1/§10; tasks 43–49). One commit per task; a failing
test first where testable; full suite + typecheck + lint green after each.

### Task 43 — Re-fit the Flash stage after Ruffle mounts

- Bug (Chrome): the 550px homestarrunner Flash stage was still clipped on the
  right in the ~546px desktop Restored pane. Fit-to-width ran on load, but
  Ruffle then replaced the embed with its own player element at the movie's
  natural width, so the page overflowed again after the first fit.
- Fix (`src/ui/restored-pane-logic.ts`): `FIT_TO_WIDTH_SCRIPT` now coalesces
  fits through a `requestAnimationFrame`-based `schedule()`, re-fits on a
  `MutationObserver` watching `childList`/`subtree` (the embed → player swap is
  a child-node change; fit only writes `body.style`, an attribute, so it does
  not loop on its own writes), and re-fits a few times on a short timer to catch
  the player sizing itself once the `.swf` loads.
- Tests (first): the built srcdoc carries `MutationObserver` and `childList`,
  alongside the existing `scrollWidth`/`resize`/`scale(` wiring.
- Verified: 293 tests; typecheck and lint clean.

### Task 44 — Collapse the empty reader; give Restored the full width

- Bug: when readability found no article, the empty Reader card still took half
  the width next to Restored.
- Fix: new pure `src/ui/result-layout.resultPanesClass(readerOk)` returns
  `panes` with an article and `panes panes--solo` without; `.panes--solo` is one
  full-width column at every width (placed after the two-column breakpoint so it
  wins the cascade). `ReaderPane` renders the empty case with a `pane--note`
  compact modifier; `App` sets the container class from `reader.ok`.
- Tests (first): `resultPanesClass` both branches; a theme.css guard that
  `.panes--solo` is a single column and sits after the two-column rule; the
  empty `ReaderPane` carries `pane--note`.
- Verified: 300 tests; typecheck and lint clean.

### Task 45 — Exclude zero-content tracking pixels from accounting

- Bug: 1×1/0×0 tracking pixels (now hidden at render, R3.13) still counted in
  the certificate, so the number did not match what the page showed.
- Fix (`src/dom/rewrite-document.ts`): `isTrackingPixel(el)` treats an `<img>`
  with declared `width` and `height` both 0 or 1 as a web bug; its `src` is
  still rewritten to the archive for confinement, but it is not recorded as an
  asset, so it counts toward neither recovered, missing, nor the total (R4.7).
  An image with no declared size is still counted; the render guard hides it if
  it loads at 1×1/0×0.
- Tests (first): a `width=1 height=1` pixel is rewritten but absent from the
  collected assets; a normal image is still collected; `width=0 height=0` is
  excluded; a `400×1` strip is still counted.
- Verified: 300 tests; typecheck and lint clean.

### Task 46 — Wayback MCP server

- Built `tools/wayback-mcp/`, a local Model Context Protocol server over stdio
  (TypeScript, the official `@modelcontextprotocol/sdk` 1.12.1 + zod, run with a
  local `tsx`; no global install). Three tools: `cdx_search`, `check_capture`,
  `find_swf`.
- `src/wayback.ts` holds the tool logic (fetch injected) and reuses Seance's own
  code: `parseCdxRows`/`byDate` from `src/core/capture-select`, `buildArchiveUrl`
  from `src/core/archive-url`, `detectFlashRefs` from `src/dom/flash`, and
  `fetchWithRetry`/`DEFAULT_RETRY_OPTIONS` from `api/http.ts`, so it has the same
  timeout and rate-limit care. All archive traffic goes to `web.archive.org`
  only; nothing is persisted. `src/index.ts` is the thin MCP wiring (kept free of
  the SDK in the test graph by isolating it from `wayback.ts`).
- Tests (first, offline): `tests/tools/wayback.test.ts` (9 cases with a mocked
  fetch): CDX parsing + day collapse + the 200 filter in the query string;
  `check_capture` exact and closest and none; `find_swf` detecting object/embed/
  param `.swf` from fixture HTML (two archive requests) and reporting no capture
  without a page fetch; and URL/timestamp validation.
- Smoke test: an `initialize` + `tools/list` handshake over stdio returned all
  three tools with correct JSON schemas, and the tool typecheck is clean.
- Problem hit: the SDK's `server.tool` handler types its args as a generic
  record, so each handler casts to its param type; `@types/node` was added for
  the tool's own typecheck; eslint ignores were widened to `**/node_modules/**`
  and `tools/**/*.ts` was given node globals.
- Verified: 309 tests (9 new); root typecheck and lint clean.

### Task 47 — Register the MCP server for Kiro

- Added the server to the `seance` agent config (`.kiro/agents/seance.json`)
  under `mcpServers`, and listed the three tools in `tools`/`allowedTools`.
- `.kiro/settings/mcp.json` is write-protected in this workspace's agent
  sandbox, so the identical config is committed as a template at
  `tools/wayback-mcp/mcp.json`, with a one-line `cp` instruction in the tool
  README. The launch command is `npm --prefix tools/wayback-mcp run start`,
  which uses the tool's local `tsx`.
- Verified: both JSON files parse.

### Task 48 — Find demo URLs with the MCP server

- Ran the three tools against the live archive through
  `tools/wayback-mcp/scripts/demo-probe.ts` (which wraps the real fetch with a
  request counter). Used 12 archive requests (budget 25).
- Chose two public-domain NASA education pages: `kids.msfc.nasa.gov` (last
  working 26 September 2007; Flash `HPAgain3.swf` in the 30 December 2005
  capture, confirmed HTTP 200 Flash bytes, so it is a capture-picker + Ruffle
  demo), and `spacelink.nasa.gov` (last working 31 January 2005; a plain death
  certificate). `find_swf` on the 2007 capture returned no `.swf`, which is why
  the picker is needed to reach the 2005 Flash. Recorded in `docs/demo-urls.md`.
- Problem hit: the default `cdx_search` limit returns the oldest rows, so the
  true last-working date needed a `from`/`to` bracket on recent years; noted in
  the probe commands.

### Task 49 — Kiro write-up

- Wrote `docs/kiro-writeup.md` for the Devpost "how Kiro was used" field from
  this log and git history: the Kiro CLI surface and phase-by-phase runs, the
  custom `seance` agent, the postToolUse test hook and the red-to-green pattern
  it showed, spec-driven development versus vibe coding, the steering docs
  (`structure.md` mattered most), the MCP server and what it enabled,
  property-based testing (the six rewriter invariants, and the honest note that
  no property test caught a surprise regression during the build), and the Kiro
  powers result.
- Kiro powers: `kiro-cli powers` has only `install`/`uninstall` and no catalog
  list; logged in, several relevant names (`git`, `playwright`, `vitest`,
  `typescript`, `mcp`, `browser`) all returned "No power named … in the
  catalog", so none was installed. Recorded honestly as "none fit".
- Plain English, no hype words (grep clean), no em dashes (grep clean).

### Re-check in a browser (needs a human; `npm run dev`, no server started here)

- `http://kids.msfc.nasa.gov/`: the certificate reads "died 26 September 2007";
  opening the 30 December 2005 capture from the picker plays `HPAgain3.swf`
  through Ruffle, and the 550px Flash stage now fits the ~546px desktop pane and
  375px phone (resize to confirm it rescales after Ruffle mounts).
- `http://spacelink.nasa.gov/`: the certificate reads "died 31 January 2005" and
  the recovery percentage reflects what actually loaded.
- A page with no readable article: the Reader collapses to a slim note and the
  Restored pane takes the full width.
- A page with 1×1 tracking pixels: the certificate count matches the visible
  assets (the pixels are not counted and are hidden).

## Task 50 — Make the NASA Kids Flash stage visible

- Problem (browser re-test, Chrome vs live archive, Wayback MCP for lookups):
  on `http://kids.msfc.nasa.gov/` the 30 Dec 2005 capture's two embeds are
  `<object>/<embed>` with `width="90%" height="90%"`. In the `srcdoc` document
  the body had no resolved height, so 90% collapsed to ~0 and the stage showed
  as a thin strip with no Ruffle player, even though `/api/swf` served the
  `.swf` bytes fine (verified by curl: FWS, 32,896 bytes).
- Fix (ours to fix, per the brief):
  - `buildRestoredSrcDoc` now injects `FLASH_STAGE_STYLE`
    (`html,body{height:100%}` + a `min-height` on `object`/`embed`/the Ruffle
    elements) only when the page has Flash, so a percentage-size stage has a
    definite ancestor height to resolve against. Ordinary pages are untouched.
  - The Ruffle config is built by `buildRuffleConfigScript(base?)` and carries
    `base` = the page's raw archive prefix
    (`buildArchiveUrl(pageUrl, ts, { raw:true })`, threaded via a new
    `pageArchiveBase` option and `RestoredPane`'s `captureTimestamp` prop), so a
    movie's relative loads resolve against the archive, not the opaque origin.
    The base's target stays an archive URL, so confinement (R3.4) holds.
- Kiro features used: spec-first (added R6.8, design §9.3), test-first
  (restored-pane-logic tests for the base-in-config and the stage-height rule,
  and their absence on a no-Flash page), the Wayback MCP server (`cdx_search`,
  `check_capture`) to confirm the embed markup and that the `.swf` capture
  exists (`20051230162231`, 200, `application/x-shockwave-flash`).
- Verified: 312 tests pass (+3), typecheck and lint clean. That a real `.swf`
  actually paints is browser-only; added to the demo re-check list.

## Task 51 — Death date excludes redirect stubs

- Problem (browser re-test, Wayback MCP for lookups): the app read "Died on
  20 December 2011" for `http://kids.msfc.nasa.gov/`, and `demo-urls.md` guessed
  26 September 2007. Checking the live CDX with the MCP server showed both dates
  are the *same* 714-byte JavaScript redirect stub
  (`window.location.href='http://www.nasa.gov/.../kidsclub/flash/index.html'`,
  CDX digest `CGDP…`). The stub served HTTP 200 from 15 April 2006 until its
  last 200 on 20 December 2011. The real homepage (the one with Flash, digest
  `HU24…`) was last captured as real content on **12 April 2006**. So "most
  recent 200" lands on a parked placeholder, not the real site.
- Rule decided and documented (R2.7, design §6): a redirect stub is a 200 page
  whose only effect is to navigate elsewhere (meta refresh or a body-level
  `window.location`/`location.replace`) and that carries little real content.
  When the most recent 200 capture is such a stub, the death date and the
  default view are the most recent status-200 capture whose CDX content digest
  differs — the last capture of the real site. The capture picker still lists
  every saved day, so the stub stays reachable.
- Built:
  - `Capture.digest?` + `parseCdxRows` now fills field index 5 (additive;
    `exactOptionalPropertyTypes`-safe, only set when present).
  - `core/redirect-stub.classifyRedirectStub(html)` — pure regex detector for
    meta-refresh and JS location redirects, guarded by a visible-text length
    cap so a real page that merely reads `location` is not misclassified.
  - `core/capture-select.lastRealCapture(captures, stubDigest)` — most recent
    200 with a different known digest, falling back to the newest 200.
  - `recover` classifies the default newest-200 snapshot; when it is a stub and
    an earlier real capture exists, it shows and dates that capture instead. One
    extra snapshot fetch, default path only; an explicit picker choice is shown
    as-is.
- Kiro features used: spec-first (R2.7, design §6), test-first (redirect-stub
  detector, `lastRealCapture`, and a recover integration test asserting the
  shown capture + death date are the real one and that a picked stub is shown
  as-is), the Wayback MCP server (`cdx_search`, `check_capture`) plus a few
  one-shot CDX/snapshot requests to establish the digest timeline.
- `demo-urls.md` updated to 12 April 2006 and the real behaviour.
- Verified: 324 tests pass (+12), typecheck and lint clean.

## Task 52 — No percentage for a page with no assets

- Problem (browser re-test): a page that referenced no separate files showed
  "0 of 0 assets recovered" and "Recovery 100%" with a full meter, which reads
  as a false success.
- Fix (R5.6, design §6): `DeathCertificate` now checks `assets.length === 0`
  and, in that case, drops the percent, the meter, the tally, and the missing
  list, and shows the plain line "This page had no separate images, styles, or
  files to recover. Only the page itself was saved." The last-working date and
  the rest of the certificate are unchanged. A page with real assets still
  shows the meter and percent.
- Kiro features used: spec-first (R5.6), test-first (repurposed the former
  empty-assets "clean certificate" test to use real recovered assets, and added
  an R5.6 test asserting no `role="meter"`/percent and the plain no-assets line
  while the date still shows), voice.md (plain, honest, no hype).
- Verified: 325 tests pass, typecheck and lint clean.

## Task 53 — Describe unchecked assets honestly

- Problem (browser re-test, Chrome vs live archive): on
  `http://spacelink.nasa.gov/` the partial banner said "4 of 17 assets
  recovered. 13 could not be reached." and the certificate said "Recovery 24%".
  Since task 32 caps asset checks at four (`DEFAULT_MAX_CHECKED_ASSETS`), the
  other 13 were never checked (reported `unknown`), so "could not be reached"
  was false and 24% (4/17) understated what Seance actually verified.
- Fix (R4.3, R8.5, R8.7, design §6/§11):
  - `core/recovery.recoveryPercent` now divides by the *checked* assets
    (recovered + missing), not the total. 4 recovered of 4 checked reads 100%,
    with the 13 unchecked named separately, instead of a dishonest 24%. Added
    `checkedCount(assets)` for the UI. `unknown` is still never in the
    numerator (R4.4).
  - `DeathCertificate` shows "N of M checked files came back from the Internet
    Archive", a tally line "K not checked, to keep requests to the archive low
    (status unknown, not counted as recovered)", and, when nothing could be
    checked (all unknown), no meter/percent and a plain "checked none of the N
    files" line rather than a false 100%.
  - `status-banner.partialBanner(assets)` is a new pure gate: it returns a
    partial status only when a *checked* asset is missing, so a page where
    everything checked came back shows no "Partial contact" banner even with
    many unchecked files. `App` uses it. The partial copy now reads "N of M
    checked files came back. K could not be reached." plus, when any were
    skipped, "J more were not checked, to keep requests to the archive low."
- Kiro features used: spec-first (reworded R4.3, R8.5, design §6 and the §11
  partial row), test-first (updated `recovery`, `death-certificate`,
  `status-banner`, and the end-to-end `recover-flow` expectations to the
  checked-only semantics; added `partialBanner` gating tests and a
  nothing-checked certificate test — 12 reds first, then green), voice.md
  (plain, honest, numbers, no blame, no hype).
- The recover-flow fixture (5 assets: 3 recovered, 1 missing, 1 unknown) now
  reports 75% (3 of 4 checked), not 60% (3 of 5). The GeoCities legacy-assets
  case is unchanged at 20% because all five were checked (1 recovered, 4
  missing, no unknown).
- Verified: 331 tests pass (+6 net), typecheck and lint clean.
