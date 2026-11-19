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
