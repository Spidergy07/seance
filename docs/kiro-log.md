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
