# Seance — Tasks

Build order, smallest safe steps first. Each task lists the requirements
(`requirements.md`) and design sections (`design.md`) it satisfies. "Done"
means the listed tests pass under `vitest` and the step is committed. Target:
about 10 working days for one person. Suggested day markers are a guide, not a
contract.

Legend: [R#] requirement id, [D#] design section.

---

## Phase 0 — Project setup (Day 1)

1. [x] **Initialise the toolchain.** Create `package.json`, `tsconfig.json`
   (strict), `vite.config.ts`, `vitest.config.ts`, `index.html`. Add scripts:
   `dev`, `build`, `test`, `test:watch`, `lint`, `typecheck`. Install project
   devDependencies locally (no global installs). [N3]
   - Done: `npm run typecheck` and `npm test` run with zero tests and exit 0.

2. [x] **Set up the test environment.** Configure vitest for Node, add `linkedom`
   and `fast-check` as devDependencies, add a trivial sample test to prove the
   runner and DOM shim work. [N1, N2, D12]
   - Done: a sample `linkedom` test and a sample `fast-check` test pass.

## Phase 1 — Core, pure logic (Days 2–4)

3. [x] **Domain types.** Implement `src/core/types.ts` per [D2].
   - Done: types compile; no runtime code yet.

4. [x] **Archive URL module.** Implement `src/core/archive-url.ts`:
   `buildArchiveUrl(originalUrl, timestamp, { raw })` and
   `parseArchiveUrl(archiveUrl)` → `{ originalUrl, timestamp, raw }`. Single
   source of truth for the archive prefix. [R3.1, D4.2 step 6, D4.4]
   - Tests (`tests/core/archive-url.test.ts`): round-trip
     `parse(build(u, ts)) === { u, ts }`; prefix shape is exactly
     `https://web.archive.org/web/<ts>[id_]/`.

5. [x] **URL rewriter — example tests first.** Implement
   `src/core/url-rewriter.ts` `rewrite(ref, ctx)` per [D4.2]. Write
   example-based tests (`tests/core/url-rewriter.test.ts`) covering: absolute
   url, relative path, root-relative path, protocol-relative, pure fragment,
   query+fragment, `mailto:`/`tel:`/`javascript:`/`data:` passthrough,
   already-archived input. [R3.1–R3.6]
   - Done: all example tests pass.

6. [x] **URL rewriter — property tests.** Add
   `tests/core/url-rewriter.prop.test.ts` with fast-check generators and assert
   the invariants from [D4.3]:
   - I1 idempotence: `rewrite(rewrite(x)) === rewrite(x)` [R3.5]
   - I2 confinement: output starts with `https://web.archive.org/web/` and its
     host is `web.archive.org` [R3.4]
   - I3 fragment preservation: `#f` survives for resolvable inputs; pure
     fragments pass through [R3.3]
   - I4 query preservation [R3.3]
   - I5 passthrough for non-resolvable schemes [R3.6]
   - I6 timestamp fidelity: embedded timestamp equals `ctx.timestamp`
   - Done: property suite passes with a reasonable run count (e.g. 1000 runs).

7. [x] **`srcset` and CSS `url(...)` rewriting.** Extend the rewriter (or add
   helpers) for comma-separated `srcset` and `url(...)` extraction, preserving
   descriptors and quoting. [D4.4]
   - Tests: multi-candidate `srcset` keeps descriptors; quoted and unquoted
     `url(...)` keep their quoting; property test that descriptor/quote shape is
     preserved.

8. [x] **Capture selection.** Implement `src/core/capture-select.ts`:
   `selectBest`, `lastWorking`, `byDate`, and the no-200 fallback. [R2.2–R2.5,
   D5]
   - Tests (`tests/core/capture-select.test.ts`) with CDX fixtures: picks most
     recent 200; returns fallback when no 200; empty input returns no capture;
     `byDate` is sorted and de-duplicated.

9. **Recovery accounting.** Implement `src/core/recovery.ts`: counts, percent,
   grouping; unknown/missing never count as recovered. [R4.3–R4.5, R8.6, D6]
   - Tests (`tests/core/recovery.test.ts`): percent rounding; empty assets →
     100%; unknown excluded from recovered; grouping by kind.

## Phase 2 — Network boundary + proxy (Days 4–5)

10. **CDX proxy function.** Implement `api/cdx.ts`: accept an original URL,
    query the Wayback CDX API, return parsed rows as JSON. Add a hard timeout,
    backoff/retry on 429 and transient errors, and `Retry-After` handling. No
    persistence. [R2.1, R8.2–R8.4, R9.1, R9.5, D11]
    - Tests: with a mocked fetch, assert request shape, timeout aborts, retry
      on 429 then success, give-up after capped attempts.

11. **Snapshot proxy (if needed).** Implement `api/snapshot.ts` to fetch
    archived HTML/assets with correct headers and the `id_` raw modifier, only
    where CORS or header control requires it. [D3 step 4, D11]
    - Tests: with mocked fetch, correct upstream URL and timeout behaviour.

12. **Archive clients.** Implement `src/archive/cdx-client.ts` and
    `src/archive/snapshot-client.ts` that call only our own `api/` endpoints.
    [R9.1, D1, D3]
    - Tests: clients call our endpoints (mocked), parse responses, surface
      errors as typed results; no direct archive.org calls.

## Phase 3 — DOM rewriting + reader + Flash (Days 5–7)

13. **Document rewriter.** Implement `src/dom/rewrite-document.ts`: walk the
    attribute set in [D7], delegate every URL to `core/url-rewriter`, neutralise
    `<base>`. [R3.1, R3.7 prep, D7]
    - Tests (`tests/dom/rewrite-document.test.ts`, linkedom + fixture HTML):
      every resource attribute is rewritten; **confinement check**: after
      rewriting, no element references a host other than `web.archive.org`;
      fragments on in-page anchors preserved.

14. **Asset status collection.** While rewriting, collect referenced assets and
    resolve each to `recovered`/`missing`/`unknown` via batched CDX lookups,
    producing `AssetResult[]`. [R4.1, R4.2, R4.4, D3 step 6]
    - Tests: fixture page with a mix of present/absent assets yields the
      expected statuses; unknown path covered.

15. **Reader view.** Implement `src/dom/reader.ts` using readability on a DOM
    clone, then rewrite its asset URLs. Handle the no-article case. [R7.1, R7.3,
    R7.4, D10]
    - Tests: fixture article extracts expected text; images in reader output
      are archive URLs; no-article fixture returns the empty-article result.

16. **Flash detection + Ruffle mount.** Implement `src/dom/flash.ts`: detect
    `.swf`, check capture, mount Ruffle for recovered, plain notice for missing,
    plain error on Ruffle failure. [R6.1–R6.5, D9]
    - Tests: detection logic and status mapping are unit-tested; Ruffle mount is
      behind an injectable loader so tests do not load WASM. Manual check: one
      real archived `.swf` plays in the browser.

## Phase 4 — UI (Days 7–9)

17. **App shell + URL input.** `src/ui/App.tsx`, `src/ui/UrlInput.tsx`,
    `src/main.tsx`. Validate input with the WHATWG URL API; scheme-guess flow;
    disable control while running. [R1.1–R1.4, D3 step 1]
    - Tests: validation accepts/rejects the right inputs; scheme guess surfaces
      the interpreted URL before searching.

18. **Restored pane (sandboxed iframe).** `src/ui/RestoredPane.tsx`: render
    rewritten HTML in a sandboxed iframe; intercept internal link activations
    and re-run recovery via postMessage to the shell. [R3.7, R3.8, R9.2, D8]
    - Tests: iframe carries the sandbox attribute; internal-link message
      triggers a new recovery for the link's original URL.

19. **Reader pane + responsive layout.** `src/ui/ReaderPane.tsx` and the
    two-pane/stacked layout (reader first on narrow screens). [R7.2, N4]
    - Tests/checks: layout stacks under the breakpoint; keyboard operable;
      `prefers-reduced-motion` respected.

20. **Death certificate panel.** `src/ui/DeathCertificate.tsx`: last working
    capture date, recovery percent as number + meter, missing count linking to
    the list, selected-vs-last capture note. Copy follows `voice.md`. [R5.1–R5.4,
    R4.3, D6]
    - Tests: renders the certificate from a `RecoveryReport` fixture; shows
      counts and percent; dates formatted plainly.

21. **Status banners for all error states.** `src/ui/StatusBanner.tsx` covering
    every row in [D11]: invalid URL, no captures, no working capture, slow,
    rate limited, outage, partial, Flash missing, Ruffle failure. Copy follows
    `voice.md`. [R8.1–R8.6, R1.2]
    - Tests: each state renders its plain message and next step; partial state
      shows recovered vs missing counts.

## Phase 5 — Integration, polish, docs (Days 9–10)

22. **End-to-end wiring with fixtures.** Connect input → clients (mocked) →
    rewrite → report → panes, driven by recorded fixtures for a known dead page.
    [D3]
    - Tests: an integration test runs the full flow offline and asserts the
      report and rendered panes.

23. **Theme + accessibility pass.** Apply `theme.css`; verify colour is never
    the only signal, themed labels have literal accessible names, keyboard and
    reduced-motion behaviour. [voice.md, N4, R9.3]
    - Checks: automated a11y check on the main view; manual keyboard walk.

24. **Attribution + privacy review.** Add plain-text credits for the Internet
    Archive and Ruffle; confirm no logos/trademarks; confirm the proxy persists
    nothing and talks only to the archive. [R9.1, R9.3, R9.4, R9.5]
    - Checks: grep the UI for image/logo assets; review proxy code for storage.

25. **Manual verification against real archive.** With a real dead URL: confirm
    restored assets load from the archive prefix, the certificate shows a real
    last-good date and a computed percent, one `.swf` plays via Ruffle, reader
    view is legible on a narrow screen, and each error state can be reproduced
    (e.g. an un-archived URL for "no contact"). [R2, R3, R5, R6, R7, R8]
    - Done: a short manual checklist is filled in and noted in the README.

26. **Expand README.** Replace the stub with run/build/deploy steps, the
    fixture-based test story, and the Kiro workflow (steering + spec + the
    test-on-change hook). [docs]

---

## Property-based test summary (the non-negotiable ones)
These must exist and pass before the UI is trusted:
- Rewriter **idempotence** (I1) — task 6 [R3.5]
- Rewriter **confinement**, never outside the archive prefix (I2) — task 6
  [R3.4]
- Rewriter **fragment preservation** (I3) — task 6 [R3.3]
- Rewriter **query preservation** (I4) — task 6 [R3.3]
- Document-level **confinement** after a full rewrite — task 13 [R3.4]
