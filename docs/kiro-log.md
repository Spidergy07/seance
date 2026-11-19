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
