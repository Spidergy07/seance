# Project Structure

Planned layout. Nothing here is built yet; this is the target so the build
phase has a map. Keep pure logic separate from UI and network so the core is
easy to property-test.

```
seance/
  LICENSE
  README.md
  package.json
  tsconfig.json
  vite.config.ts
  vitest.config.ts
  index.html

  .kiro/
    steering/
      product.md         # purpose, users, scope
      tech.md            # stack and reasons
      structure.md       # this file
      voice.md           # seance theme + copy rules
    specs/
      seance/
        requirements.md  # EARS user stories
        design.md        # architecture, data flow, rewriter invariants
        tasks.md         # numbered build-order tasks
    agents/
      seance.json        # agent config + test-on-change hook
    hooks/
      run-tests.sh       # guard script the hook calls

  src/
    core/                # pure, no DOM, no network, no React
      url-rewriter.ts    # the link/asset rewriter (property-tested)
      archive-url.ts     # build + parse Wayback archive URLs
      capture-select.ts  # choose closest working capture from CDX rows
      recovery.ts        # recovery percentage + missing-asset accounting
      types.ts           # shared domain types (Capture, AssetResult, etc.)

    archive/             # network boundary: talks to our CDX proxy only
      result.ts          # shared typed ClientResult/ClientError + mappers
      cdx-client.ts      # fetch CDX rows via the serverless function
      capture-lookup.ts  # batched CaptureLookup over the CDX proxy
      snapshot-client.ts # fetch archived HTML/assets

    dom/                 # DOM-dependent rewriting (runs in browser + linkedom)
      rewrite-document.ts # walk a parsed DOM, apply url-rewriter to attrs
      asset-status.ts     # resolve collected assets to recovered/missing/unknown
      reader.ts           # readability extraction for the reader pane
      flash.ts            # detect .swf, mount Ruffle player

    ui/                  # React components
      App.tsx
      UrlInput.tsx
      RestoredPane.tsx    # restored page (sandboxed iframe)
      ReaderPane.tsx      # cleaned mobile-readable view
      DeathCertificate.tsx # died-on date, recovery %, missing assets
      StatusBanner.tsx    # error/empty/loading states
      theme.css

    main.tsx             # React entry

  api/                   # serverless function(s); the CDX proxy
    http.ts              # shared timeout + retry/backoff helper for the proxies
    router.ts            # dispatch /api/cdx + /api/snapshot to one entry point
    cdx.ts               # proxy CDX queries to the Wayback Machine
    snapshot.ts          # proxy archived resource fetches (if needed)

  tests/
    core/
      url-rewriter.prop.test.ts   # fast-check property tests
      url-rewriter.test.ts        # example-based tests
      capture-select.test.ts
      recovery.test.ts
    dom/
      rewrite-document.test.ts    # runs against linkedom
    fixtures/
      cdx/                         # recorded CDX responses
      html/                        # sample archived pages
```

## Rules
- `src/core/` imports nothing from `src/ui/`, `src/dom/`, or `src/archive/`.
  It is pure TypeScript: given inputs, returns outputs, no side effects. This is
  what makes the property tests meaningful.
- `src/archive/` is the only place that performs network calls, and it only
  calls our own `api/` function, never the archive directly from the browser.
- `src/dom/` may use the DOM but delegates every URL decision to
  `src/core/url-rewriter.ts`.
- `api/` contains the serverless function(s) and has no React or DOM code.
- Tests mirror the `src/` tree under `tests/` and never hit the network;
  they use fixtures under `tests/fixtures/`.

## Naming
- `*.test.ts` for example-based tests.
- `*.prop.test.ts` for property-based (fast-check) tests.
- One module, one responsibility; prefer small files over large ones.
