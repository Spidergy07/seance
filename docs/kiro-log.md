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
