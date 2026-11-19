# Tech Stack

## Goals that drive the choices
- One person can build it in about 10 working days.
- Deploys for free.
- TypeScript everywhere, so the rewriter logic is typed and testable.
- The core logic (URL rewriting, capture selection, recovery math) is pure and
  property-testable, separate from UI and network.

## Stack

### Frontend: Vite + React + TypeScript
- Vite for a fast dev server and a static production build that any free host
  (Netlify, Vercel, Cloudflare Pages, GitHub Pages) can serve.
- React for the two-pane layout and the death-certificate panel. It is the
  stack most contributors know, which matters for a short build.
- TypeScript in strict mode so the rewriter's invariants are enforced at the
  type level where possible.

Reason: the UI is small (one input, two panes, one status panel). Vite keeps
the toolchain minimal and the build output is a plain static bundle.

### CDX proxy: one serverless function
- The Wayback CDX API and archived snapshots are read from a single serverless
  function (Vercel/Netlify function, or Cloudflare Worker). The browser calls
  our function; the function calls the archive.
- Reasons:
  - Avoids CORS problems calling the archive directly from the browser.
  - Gives one place to add caching, timeouts, and rate-limit handling.
  - Keeps the client dumb: it only talks to our own endpoint.
- The function is stateless. No database. Short-lived in-memory or edge cache
  only, if any.

Reason for serverless over a long-running server: the hackathon constraints
forbid starting long-running servers, and a function deploys free and scales to
zero.

### Flash playback: Ruffle (WASM)
- Ruffle is loaded from its official distribution (CDN build or the `@ruffle-rs`
  npm package). It emulates `.swf` files in the browser via WebAssembly.
- Seance never ships a Flash plugin and never executes archived scripts outside
  Ruffle's sandbox.

### HTML parsing and rewriting
- Parse archived HTML with a standards-based parser. In the browser, use
  `DOMParser`. For Node-side unit tests, use `linkedom` (a small, fast DOM
  implementation) so the same rewriter code runs under test without a browser.
- URL resolution uses the built-in WHATWG `URL` API, not hand-rolled string
  joins. This is the single most important correctness decision for the
  rewriter.

### Reader view
- Use `@mozilla/readability` to extract the main article content from the
  archived DOM, then render it in a clean, mobile-first layout.

## Testing

### vitest
- Unit and integration tests for pure logic and DOM rewriting.
- Runs under Node with the `linkedom` DOM, so tests need no browser.

### fast-check (property-based tests)
- The URL rewriter is the riskiest piece, so it gets property tests, not just
  examples. Required properties (see spec `tasks.md` and `design.md`):
  - Idempotence: rewriting an already-rewritten URL changes nothing.
  - Confinement: every rewritten URL begins with the archive prefix; the
    rewriter never emits a link pointing outside the archive.
  - Fragment preservation: `#section` fragments survive rewriting unchanged.
  - Query preservation: query strings are preserved.
- fast-check generates random URLs, paths, and fragments to try to break these.

### Network boundary in tests
- Tests never hit the real archive. The CDX client is mocked with recorded
  fixtures so tests are deterministic and offline.

## What we deliberately avoid
- No backend framework, no ORM, no database.
- No global tooling installs; everything is a project `devDependency` run via
  `npx`/package scripts.
- No CSS framework if plain CSS modules suffice; the UI is small.
- No state library beyond React's built-in state; there is little global state.

## Versions
Pin exact versions in `package.json` when the build phase starts. Node 20 LTS
is the target runtime for both the function and the test suite.
