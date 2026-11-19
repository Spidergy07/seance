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

9. [x] **Recovery accounting.** Implement `src/core/recovery.ts`: counts, percent,
   grouping; unknown/missing never count as recovered. [R4.3–R4.5, R8.6, D6]
   - Tests (`tests/core/recovery.test.ts`): percent rounding; empty assets →
     100%; unknown excluded from recovered; grouping by kind.

## Phase 2 — Network boundary + proxy (Days 4–5)

10. [x] **CDX proxy function.** Implement `api/cdx.ts`: accept an original URL,
    query the Wayback CDX API, return parsed rows as JSON. Add a hard timeout,
    backoff/retry on 429 and transient errors, and `Retry-After` handling. No
    persistence. [R2.1, R8.2–R8.4, R9.1, R9.5, D11]
    - Tests: with a mocked fetch, assert request shape, timeout aborts, retry
      on 429 then success, give-up after capped attempts.

11. [x] **Snapshot proxy (if needed).** Implement `api/snapshot.ts` to fetch
    archived HTML/assets with correct headers and the `id_` raw modifier, only
    where CORS or header control requires it. [D3 step 4, D11]
    - Tests: with mocked fetch, correct upstream URL and timeout behaviour.

12. [x] **Archive clients.** Implement `src/archive/cdx-client.ts` and
    `src/archive/snapshot-client.ts` that call only our own `api/` endpoints.
    [R9.1, D1, D3]
    - Tests: clients call our endpoints (mocked), parse responses, surface
      errors as typed results; no direct archive.org calls.

## Phase 3 — DOM rewriting + reader + Flash (Days 5–7)

13. [x] **Document rewriter.** Implement `src/dom/rewrite-document.ts`: walk the
    attribute set in [D7], delegate every URL to `core/url-rewriter`, neutralise
    `<base>`. [R3.1, R3.7 prep, D7]
    - Tests (`tests/dom/rewrite-document.test.ts`, linkedom + fixture HTML):
      every resource attribute is rewritten; **confinement check**: after
      rewriting, no element references a host other than `web.archive.org`;
      fragments on in-page anchors preserved.

14. [x] **Asset status collection.** While rewriting, collect referenced assets and
    resolve each to `recovered`/`missing`/`unknown` via batched CDX lookups,
    producing `AssetResult[]`. [R4.1, R4.2, R4.4, D3 step 6]
    - Tests: fixture page with a mix of present/absent assets yields the
      expected statuses; unknown path covered.

15. [x] **Reader view.** Implement `src/dom/reader.ts` using readability on a DOM
    clone, then rewrite its asset URLs. Handle the no-article case. [R7.1, R7.3,
    R7.4, D10]
    - Tests: fixture article extracts expected text; images in reader output
      are archive URLs; no-article fixture returns the empty-article result.

16. [x] **Flash detection + Ruffle mount.** Implement `src/dom/flash.ts`: detect
    `.swf`, check capture, mount Ruffle for recovered, plain notice for missing,
    plain error on Ruffle failure. [R6.1–R6.5, D9]
    - Tests: detection logic and status mapping are unit-tested; Ruffle mount is
      behind an injectable loader so tests do not load WASM. Manual check: one
      real archived `.swf` plays in the browser.

## Phase 4 — UI (Days 7–9)

17. [x] **App shell + URL input.** `src/ui/App.tsx`, `src/ui/UrlInput.tsx`,
    `src/main.tsx`. Validate input with the WHATWG URL API; scheme-guess flow;
    disable control while running. [R1.1–R1.4, D3 step 1]
    - Tests: validation accepts/rejects the right inputs; scheme guess surfaces
      the interpreted URL before searching.

18. [x] **Restored pane (sandboxed iframe).** `src/ui/RestoredPane.tsx`: render
    rewritten HTML in a sandboxed iframe; intercept internal link activations
    and re-run recovery via postMessage to the shell. [R3.7, R3.8, R9.2, D8]
    - Tests: iframe carries the sandbox attribute; internal-link message
      triggers a new recovery for the link's original URL.

19. [x] **Reader pane + responsive layout.** `src/ui/ReaderPane.tsx` and the
    two-pane/stacked layout (reader first on narrow screens). [R7.2, N4]
    - Tests/checks: layout stacks under the breakpoint; keyboard operable;
      `prefers-reduced-motion` respected.

20. [x] **Death certificate panel.** `src/ui/DeathCertificate.tsx`: last working
    capture date, recovery percent as number + meter, missing count linking to
    the list, selected-vs-last capture note. Copy follows `voice.md`. [R5.1–R5.4,
    R4.3, D6]
    - Tests: renders the certificate from a `RecoveryReport` fixture; shows
      counts and percent; dates formatted plainly.

21. [x] **Status banners for all error states.** `src/ui/StatusBanner.tsx` covering
    every row in [D11]: invalid URL, no captures, no working capture, slow,
    rate limited, outage, partial, Flash missing, Ruffle failure. Copy follows
    `voice.md`. [R8.1–R8.6, R1.2]
    - Tests: each state renders its plain message and next step; partial state
      shows recovered vs missing counts.

## Phase 5 — Integration, polish, docs (Days 9–10)

22. [x] **End-to-end wiring with fixtures.** Connect input → clients (mocked) →
    rewrite → report → panes, driven by recorded fixtures for a known dead page.
    [D3]
    - Tests: an integration test runs the full flow offline and asserts the
      report and rendered panes.

23. [x] **Theme + accessibility pass.** Apply `theme.css`; verify colour is never
    the only signal, themed labels have literal accessible names, keyboard and
    reduced-motion behaviour. [voice.md, N4, R9.3]
    - Checks: automated a11y check on the main view; manual keyboard walk.

24. [x] **Attribution + privacy review.** Add plain-text credits for the Internet
    Archive and Ruffle; confirm no logos/trademarks; confirm the proxy persists
    nothing and talks only to the archive. [R9.1, R9.3, R9.4, R9.5]
    - Checks: grep the UI for image/logo assets; review proxy code for storage.

25. [x] **Manual verification against real archive.** With a real dead URL: confirm
    restored assets load from the archive prefix, the certificate shows a real
    last-good date and a computed percent, one `.swf` plays via Ruffle, reader
    view is legible on a narrow screen, and each error state can be reproduced
    (e.g. an un-archived URL for "no contact"). [R2, R3, R5, R6, R7, R8]
    - Done: a short manual checklist is filled in and noted in the README.

26. [x] **Expand README.** Replace the stub with run/build/deploy steps, the
    fixture-based test story, and the Kiro workflow (steering + spec + the
    test-on-change hook). [docs]

## Phase 6 — Browser-test fix round (post-launch bugs)

Bugs found by a human testing the running app in a real browser (desktop
1440px, phone 375px) against the live Internet Archive. One local commit per
task; tests and typecheck pass after each.

27. [x] **Keep the restored page on the restored document.** The Restored iframe
    went blank: a `<meta http-equiv="refresh">` navigated the frame away
    (GeoCities "you will be redirected"), framesets fetched dead-origin frames,
    and some archived pages carried a `<meta>` CSP that blocked archive assets
    and the interceptor. Neutralise meta refresh (remove it, surface the target
    as a link that re-runs recovery), rewrite `<frame src>` like other
    references, strip archived `<meta>` CSP, and inject a navigation guard
    (cancel form submits, neutralise `window.open`) into the frame.
    [R3.9, R3.10, R3.11, D7, D8]
    - Tests: fixture HTML with meta refresh + CSP + frameset — after rewrite the
      refresh/CSP metas are gone, a notice link points at the archive, and
      frames are archive URLs; the built srcdoc contains the navigation guard.

28. [x] **Honest asset accounting.** The GeoCities certificate read "3 of 3, 100%"
    while a background image showed broken. Legacy image-bearing attributes
    (`background` on body/table cells, `<input type=image src>`) were neither
    rewritten nor counted, so a genuinely missing image never entered the
    report. Rewrite and collect those attributes so every referenced image is
    accounted for and only a real status-200 capture counts as recovered; the
    rest are missing or unknown. [R4.1–R4.4, R3.4, D6, D7]
    - Tests: fixture with `body[background]`/`td[background]`/`input[src]` where
      the background has no capture — it is collected, rewritten to the archive,
      and reported missing (not counted as recovered).

29. [x] **Do not call a recently-live site dead.** homestarrunner.com still answers
    today (last capture 2 days ago) yet the certificate said "Died on …". When
    the most recent working capture is within the last 30 days of now, show a
    plain "Still answering recently. Last saved copy: <date>." state and suggest
    picking an older capture, instead of a death date. [R5.1, voice.md, D6]
    - Tests: a pure liveness classifier (timestamp vs a reference date) returns
      recently-alive within 30 days and dead beyond it; the certificate renders
      the alive copy for a recent capture and the death date for an old one.

30. [x] **Capture picker for older captures.** Flash on homestarrunner exists only
    in 2004–2006 captures, but the app always used the newest. Surface the
    page's captures (grouped by year, then date, from the existing `byDate`
    logic) and let the visitor open an older one, re-running recovery for that
    timestamp. Keyboard accessible and usable at 375px. [R2.4, D5]
    - Tests: `selectByTimestamp` picks the exact capture; the recovery view
      carries the capture list; the picker groups by year and calls back with
      the chosen timestamp.

31. [x] **Fix "how it works" step overlap.** In the three intro steps the numbered
    circle overlapped the first word of the step text at some widths. The list
    item's left padding was smaller than the circle's extent. Give the text
    enough left padding to clear the circle at any width. [voice.md visual rules]
    - Tests: a guard that parses `theme.css` and asserts the `.steps li` left
      padding clears the `.steps li::before` circle extent.

## Phase 7 — Rate-limit / traffic fix round (post-launch bugs)

Found by a human testing the running app against the live Internet Archive:
after a couple of recoveries the archive answered with HTTP 429, the proxy took
16s to report it, and the UI spun for 75+ seconds on one static line and never
showed the rate-limited banner. Cause: per-asset CDX lookups (one busy page
referenced 49 assets, so a single recovery fired dozens of CDX requests, each
with its own retry/backoff). One local commit per task; tests and typecheck
pass after each.

32. [x] **Cut archive traffic per recovery.** Check at most a small fixed number
    of assets (`DEFAULT_MAX_CHECKED_ASSETS`), chosen by kind priority, and
    report the rest as `unknown`; run asset checks at concurrency 2; cache CDX
    answers in memory for the session (a client cache shared across recoveries
    and a short-lived proxy cache). Aim: under six archive requests for a
    typical page. [R8.7, R8.8, R4.4, R8.6, D3.1]
    - Tests: `resolveAssetStatuses` with a cap checks only the N
      highest-priority URLs and marks the rest unknown; `createCaptureLookup`
      runs at most 2 lookups at once; `fetchCaptures` serves a repeated URL from
      the cache (no second fetch) and never caches errors; an end-to-end traffic
      test asserts a multi-asset page makes ≤6 archive requests and a second
      recovery of the same page makes no new CDX request.

33. [ ] **Bound the total wait and surface rate-limited/slow fast.** Give the
    whole recovery one deadline (~20s) threaded as an `AbortSignal` into every
    archive fetch; on the deadline, abort and show the timeout state. Reduce the
    proxy's retry worst-case so a sustained 429 returns in a couple of seconds,
    not tens. Make the rate-limited, timeout, outage, and network banners carry
    a retry control. [R8.9, R8.2, R8.3, R8.4, D11]
    - Tests: an aborted deadline makes `recover` return `timeout` without
      hanging and the clients pass the signal to fetch; an `AbortError` maps to
      the `timeout` client error; the proxy's default retry options bound the
      worst-case wait; the rate-limited/timeout/outage/network banner content is
      retryable.

34. [ ] **Show progress while waiting.** `recover` reports each step through an
    injected `onProgress` callback; the shell shows the current step's plain
    line (searching, retrieving, rebuilding, checking assets, reading) instead
    of one static message. [R8.10, R1.4, D3.1]
    - Tests: a pure label map covers every step; `recover` reports the steps in
      order for a successful run.

---

## Property-based test summary (the non-negotiable ones)
These must exist and pass before the UI is trusted:
- Rewriter **idempotence** (I1) — task 6 [R3.5]
- Rewriter **confinement**, never outside the archive prefix (I2) — task 6
  [R3.4]
- Rewriter **fragment preservation** (I3) — task 6 [R3.3]
- Rewriter **query preservation** (I4) — task 6 [R3.3]
- Document-level **confinement** after a full rewrite — task 13 [R3.4]
