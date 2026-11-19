# Seance

Seance brings dead websites back to life. Paste the URL of a site that no
longer loads; Seance finds the closest working copy in the Internet Archive
Wayback Machine, rewrites its links and assets so they load from the archive,
reports what could not be recovered, plays archived Flash through Ruffle, and
shows the restored page beside a clean, mobile-readable version.

Built for the Kiroween 2026 hackathon, category: Resurrection.

> Status: planning phase. The spec and steering docs are written; application
> code is not built yet.

## What it does
- Looks up captures of a URL via the Wayback Machine CDX API.
- Picks the closest working capture and rewrites the page to load from the
  archive.
- Shows a "death certificate": when the site died (last working capture), the
  recovery percentage, and the assets that could not be recovered.
- Plays archived `.swf` Flash files with [Ruffle](https://ruffle.rs), the
  open-source WASM Flash emulator.
- Shows the restored page next to a cleaned reader view.

The seance theme is functional: every themed element maps to real state (see
`.kiro/steering/voice.md`). No third-party logos or trademarks appear in the
UI.

## Planned stack
TypeScript end to end. Vite + React for the static frontend, one stateless
serverless function as the Wayback CDX proxy, Ruffle for Flash, and
vitest + fast-check for tests (property tests guard the URL rewriter). See
`.kiro/steering/tech.md` for the reasoning.

## How Kiro is used
This project is spec-driven with Kiro:

- **Steering** (`.kiro/steering/`): `product.md`, `tech.md`, `structure.md`,
  and `voice.md` set scope, stack, layout, and copy rules.
- **Spec** (`.kiro/specs/seance/`): `requirements.md` (EARS acceptance
  criteria), `design.md` (architecture, the link rewriter and its invariants,
  error states), and `tasks.md` (numbered build-order tasks).
- **Agent + hook** (`.kiro/agents/seance.json`, `.kiro/hooks/run-tests.sh`):
  the `seance` agent loads the steering and spec as context and runs the vitest
  suite automatically whenever a TypeScript source or test file changes, via a
  `postToolUse` hook matching file writes. The hook stays silent until the
  toolchain exists.

## Getting started (once the build phase begins)
These scripts do not exist yet; they are the planned entry points.

```bash
npm install      # install project dependencies locally
npm run dev      # start the Vite dev server
npm test         # run the vitest suite (incl. fast-check property tests)
npm run build    # produce the static bundle
```

## Credits
Restoration data comes from the Internet Archive Wayback Machine. Flash
playback uses the Ruffle project. Named in plain text, without their marks, and
without implying endorsement.

## License
MIT. See [LICENSE](./LICENSE).

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
