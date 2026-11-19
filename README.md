# Seance

Seance brings dead websites back to life. Paste the URL of a site that no
longer loads; Seance finds the closest working copy in the Internet Archive
Wayback Machine, rewrites its links and assets so they load from the archive,
reports what could not be recovered, plays archived Flash through Ruffle, and
shows the restored page beside a clean, mobile-readable version.

Built for the Kiroween 2026 hackathon, category: Resurrection.

## What it does
- Looks up captures of a URL via the Wayback Machine CDX API (through our own
  proxy, never the archive directly from the browser).
- Picks the closest working (HTTP 200) capture and rewrites the page so links,
  images, stylesheets, scripts, and media load from the archive.
- Shows a "death certificate": the date of the last working capture (when the
  site effectively died), the recovery percentage as a number and a meter, and
  the assets that could not be recovered, grouped by type.
- Plays archived `.swf` Flash files with [Ruffle](https://ruffle.rs), loaded
  inside the sandboxed restored view. Flash with no saved copy gets a plain
  "not saved" notice instead.
- Shows the restored page (in a sandboxed iframe) next to a cleaned reader view
  that leads on a narrow screen.

The seance theme is functional: every themed element maps to real state (see
`.kiro/steering/voice.md`). No third-party logos or trademarks appear in the UI.

## Built with
TypeScript end to end.
- **Frontend:** Vite + React, a plain static bundle.
- **Archive proxy:** two stateless serverless functions in `api/` (`cdx.ts`,
  `snapshot.ts`) that front the Wayback Machine. They avoid browser CORS, add
  timeouts and bounded retry/backoff, and persist nothing.
- **Core logic:** pure TypeScript in `src/core/` (URL rewriter, archive-URL
  builder, capture selection, recovery math) with no DOM, no network, no React,
  so it is property-testable.
- **Flash:** Ruffle (WASM), loaded from its official build.
- **Reader view:** `@mozilla/readability`.
- **Tests:** vitest + fast-check, run under Node with `linkedom`, fully offline.

See `.kiro/steering/tech.md` for the reasoning behind each choice.

## Getting started
Node 20 LTS. Install dependencies locally (no global installs):

```bash
npm install      # install project dependencies
npm run dev      # Vite dev server + the api proxy on one origin (see below)
npm test         # run the vitest suite once (incl. fast-check property tests)
npm run build    # type-check, then produce the static bundle in dist/
npm run lint     # eslint
npm run typecheck
```

### Local development with the proxy
`npm run dev` serves the app and the archive proxy together on one origin. A
small dev-only Vite middleware (in `vite.config.ts`) routes `/api/cdx` and
`/api/snapshot` to the same functions that deploy to production, loading them
through Vite's module loader. So the browser only ever talks to our own origin,
in development and in production alike. No separate server process is needed.

## Deploying (Vercel, free tier)
The build output is a static bundle plus two stateless functions, which fits a
free static host with serverless functions. `vercel.json` sets the Vite
framework, build command, and output directory.

```bash
# with the Vercel CLI, from the project root
vercel            # preview deploy
vercel --prod     # production deploy
```

- `api/cdx.ts`, `api/snapshot.ts`, and `api/swf.ts` deploy as Vercel **Node.js
  serverless functions** (each sets `export const config = { maxDuration: 30 }`,
  leaving the runtime at the Node.js default). Each is a Web-standard handler
  taking a `Request` and returning a `Response`, using only `fetch`, `URL`, and
  `AbortController`. They first ran on the Edge runtime, but its `fetch` to
  `web.archive.org` failed in production, so they run on Node instead.
- The functions are stateless: no database, no stored queries (R9.5).
- Other free hosts work too; the functions take a Web `Request` and return a
  Web `Response`, so they port to Netlify Functions or a Cloudflare Worker with
  a thin adapter.

### Self-hosting Ruffle (optional)
By default the restored iframe loads the Ruffle runtime from its official public
build. To avoid any third-party runtime contact, host Ruffle's self-hosted
build on your own origin and pass its URL to the restored pane
(`RestoredPane`'s `ruffleScriptUrl`, default `DEFAULT_RUFFLE_SRC` in
`src/ui/restored-pane-logic.ts`). Loading the Ruffle script sends no user data
either way; this only changes where the static script comes from.

## Testing
- The suite runs offline under Node; no test touches the live archive (the CDX
  and snapshot clients are driven by recorded fixtures under
  `tests/fixtures/`).
- The URL rewriter — the correctness-critical unit — has fast-check property
  tests for its invariants: idempotence, confinement to the archive prefix,
  and fragment/query preservation. A document-level confinement test asserts
  that after a full rewrite no element references a non-archive host.
- An end-to-end test (`tests/integration/recover-flow.test.ts`) drives the
  whole flow from a fixture through a mocked proxy and asserts the recovery
  report and the rendered panes.

```bash
npm test            # all tests once
npm run test:watch  # watch mode
```

## How Kiro is used
This project is spec-driven with Kiro:

- **Steering** (`.kiro/steering/`): `product.md`, `tech.md`, `structure.md`,
  and `voice.md` set scope, stack, layout, and copy rules. They drove every
  build decision (for example, the pure-core boundary and the plain-English,
  no-hype copy).
- **Spec** (`.kiro/specs/seance/`): `requirements.md` (EARS acceptance
  criteria), `design.md` (architecture, the link rewriter and its invariants,
  error states), and `tasks.md` (numbered build-order tasks, checked off as
  they land). Each task cites the requirements and design sections it satisfies.
- **Agent + hook** (`.kiro/agents/seance.json`, `.kiro/hooks/run-tests.sh`):
  the `seance` agent loads the steering and spec as context and runs the vitest
  suite automatically whenever a TypeScript source or test file changes, via a
  `postToolUse` hook matching file writes.
- **Property-based tests:** required by the spec for the rewriter and wired in
  with fast-check (see Testing above).
- **Build log:** `docs/kiro-log.md` records, per task, what was built, which
  Kiro features were used, and any problem hit.

## Project layout
```
src/core/     pure logic (rewriter, archive-url, capture-select, recovery)
src/archive/  network boundary; calls only our own /api proxy
src/dom/      DOM rewriting, reader extraction, Flash handling
src/ui/       React components + the recovery pipeline
api/          serverless proxy functions (cdx, snapshot) + shared helpers
tests/        mirrors src/; fixtures under tests/fixtures/
.kiro/        steering, spec, agent, and hook
```
See `.kiro/steering/structure.md` for the full map and the layering rules.

## Manual verification against the live archive

Checked against the live Wayback CDX API on 19 November 2026 with a small number
of one-shot requests (no browser). These confirm the data the pipeline depends
on is real; the rendering checks that need a browser are listed afterwards.

### Dead page with good captures — `http://www.geocities.com/Athens/`
- The Wayback CDX returns HTTP 200 captures from 22 October 1996 to
  17 October 2000 (most recent 200: timestamp `20001017124759`).
- Captures after that are HTTP 301 redirects (the GeoCities domain now parks and
  redirects), so Seance's "most recent working (200) capture" rule lands on
  17 October 2000. The death certificate reads **Last working capture:
  17 October 2000**, computed from real CDX rows, not a guess.

### Archived Flash — `http://www.homestarrunner.com/intro.swf`
- The CDX returns HTTP 200 captures at `20040325185740` (25 March 2004) and
  `20060626144354` (26 June 2006).
- Seance rewrites this to the raw archive URL
  `https://web.archive.org/web/20060626144354id_/http://www.homestarrunner.com/intro.swf`
  and hands it to Ruffle inside the sandboxed restored iframe.
- Note: a per-asset exact-URL CDX query is reliable; a broad `matchType=prefix`
  regex filter for `.swf` was not, which is why Seance looks assets up by their
  exact resolved URL (see `src/archive/capture-lookup.ts`).

### Outage state, observed live
- During these checks the CDX API intermittently returned an Internet Archive
  "Temporarily Offline" HTML page instead of JSON. This is the exact
  archive-side failure Seance reports through R8.4: a non-JSON/5xx upstream
  becomes "We could not reach the Internet Archive right now. This is on their
  side or the network, not your URL." The proxy's parse guard (`api/cdx.ts`)
  turns that non-JSON body into a typed error rather than crashing.

### Browser-only checks still needing a human
These cannot be verified without a real browser; run `npm run dev` and walk
through them:
- [ ] Both URLs above load end to end; restored assets visibly come from
      `web.archive.org`, and the certificate shows the real last-good date and a
      computed recovery percent.
- [ ] `http://www.homestarrunner.com/intro.swf` actually plays via Ruffle in the
      sandboxed iframe (WebAssembly load + playback).
- [ ] The reader view is legible on a 375px-wide screen (panes stack, reader
      first).
- [ ] Each error state renders in the UI: no-contact (an un-archived URL),
      partial recovery, rate-limit countdown, and the outage message above.
- [ ] An axe/Lighthouse accessibility sweep and a keyboard-only walk pass.

## Credits
Restoration data comes from the Internet Archive Wayback Machine. Flash playback
uses the Ruffle project. Named in plain text, without their marks, and without
implying endorsement.

## License
MIT. See [LICENSE](./LICENSE).
