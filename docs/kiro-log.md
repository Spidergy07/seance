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
