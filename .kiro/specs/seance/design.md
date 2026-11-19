# Seance — Design

This document describes the architecture, the data flow, the link rewriter and
its invariants, and the error states. It implements the requirements in
`requirements.md`.

## 1. Architecture overview

Three layers, kept separate so the risky logic is pure and testable:

```
Browser (static Vite bundle)
  ui/      React components, two-pane layout, death certificate
  dom/     parse archived HTML, apply rewriter, reader view, Ruffle mount
  archive/ fetch via our proxy only
  core/    PURE: url-rewriter, archive-url, capture-select, recovery
        |
        | HTTPS to our own origin
        v
Serverless function (api/)
  cdx.ts       proxy CDX queries
  snapshot.ts  proxy archived resource fetches (when needed for CORS/headers)
        |
        | HTTPS to archive.org
        v
Internet Archive Wayback Machine (CDX API + archived snapshots)
```

Why a proxy: calling the archive directly from the browser runs into CORS and
gives us no place to handle timeouts, retries, and rate limiting. The proxy is
stateless and holds no user data (R9.1, R9.5).

## 2. Domain types (core/types.ts)

```
type OriginalUrl = string;   // the dead site's URL, absolute
type ArchiveUrl  = string;   // https://web.archive.org/web/<ts>[id_]/<orig>

interface Capture {
  originalUrl: OriginalUrl;
  timestamp: string;         // 14-digit Wayback timestamp, e.g. 20080303120000
  statusCode: number;        // archived HTTP status (200, 404, ...)
  mimeType: string;
}

type AssetKind = 'image' | 'stylesheet' | 'script' | 'media' | 'flash' | 'other';

type AssetStatus = 'recovered' | 'missing' | 'unknown';

interface AssetResult {
  originalUrl: OriginalUrl;
  kind: AssetKind;
  status: AssetStatus;
  archiveUrl?: ArchiveUrl;   // present when recovered
}

interface RecoveryReport {
  selectedCapture: Capture;
  lastWorkingCapture: Capture | null;
  assets: AssetResult[];
  recoveredCount: number;
  totalCount: number;
  recoveryPercent: number;   // whole number, recovered/total * 100
}
```

## 3. Data flow (happy path)

1. User submits a URL. `ui` validates it with the WHATWG `URL` API (R1.1).
2. `archive/cdx-client` asks `api/cdx` for captures of that URL (R2.1).
3. `core/capture-select` picks the most recent status-200 capture and also
   finds the last working capture for the certificate (R2.2, R2.5).
4. `archive/snapshot-client` fetches the archived HTML for the selected capture
   using the `id_` raw modifier so we rewrite links ourselves rather than
   inheriting the archive's own rewriting.
5. `dom/rewrite-document` parses the HTML (`DOMParser` in browser, `linkedom`
   in tests) and, for every resource attribute, calls
   `core/url-rewriter.rewrite()` (R3.1–R3.6).
6. For each referenced asset, the app checks capture existence (batched CDX
   lookups) and builds `AssetResult`s; `core/recovery` computes the report
   (R4.x).
7. `dom/reader` runs readability on the parsed DOM and rewrites its asset URLs
   with the same rewriter (R7.1, R7.4).
8. `dom/flash` finds `.swf` references and mounts Ruffle for those with a
   working capture (R6.x).
9. `ui` renders: `RestoredPane` (sandboxed iframe), `ReaderPane`,
   `DeathCertificate`, and any `StatusBanner`.

## 4. The link rewriter (core/url-rewriter.ts)

The rewriter is the correctness-critical unit. It is pure: no DOM, no network.

### 4.1 Signature
```
interface RewriteContext {
  timestamp: string;        // selected capture timestamp
  pageOriginalUrl: string;  // absolute URL of the captured page (resolution base)
  raw?: boolean;            // use id_ modifier (default true for assets we re-fetch)
}

function rewrite(ref: string, ctx: RewriteContext): string
```

### 4.2 Algorithm
1. Trim the reference. If empty, return it unchanged.
2. If the scheme is non-resolvable (`mailto:`, `tel:`, `javascript:`, `data:`,
   `blob:`, `about:`), return it unchanged (R3.6).
3. If `ref` is a pure fragment (`#foo`), return it unchanged — it stays local to
   the current archived document (R3.3).
4. Detect already-archived input: if `ref` matches the archive-URL shape, parse
   out its embedded original URL and timestamp; rewriting proceeds from the
   embedded original so a second pass is a no-op (idempotence, R3.5).
5. Resolve `ref` against `pageOriginalUrl` using `new URL(ref, pageOriginalUrl)`
   to get an absolute original URL. This preserves query and fragment (R3.2,
   R3.3).
6. Build the archive URL:
   `https://web.archive.org/web/<timestamp>[id_]/<absoluteOriginalUrl>`.
7. Re-attach the fragment from the resolved URL to the final archive URL so the
   fragment survives the prefixing (R3.3).
8. Return the archive URL.

`archive-url.ts` owns the exact prefix format and a parser
(`parseArchiveUrl`) used by step 4. Keeping prefix construction in one module
means the confinement invariant has a single source of truth.

### 4.3 Invariants (property-tested with fast-check)
For all generated inputs:

- **I1 Idempotence:** `rewrite(rewrite(x, ctx), ctx) === rewrite(x, ctx)` for
  any resolvable `x`. A second pass must not double-prefix. (R3.5)
- **I2 Confinement:** for any resolvable `x`, `rewrite(x, ctx)` starts with
  `https://web.archive.org/web/`. The rewriter never emits a URL whose host is
  outside the archive. (R3.4)
- **I3 Fragment preservation:** if `x` has fragment `#f`, then
  `rewrite(x, ctx)` ends with `#f` (for resolvable, non-pure-fragment inputs).
  Pure-fragment inputs are returned unchanged. (R3.3)
- **I4 Query preservation:** the query string of the resolved original URL
  appears in the output unchanged. (R3.3)
- **I5 Passthrough:** for non-resolvable schemes, `rewrite(x) === x`. (R3.6)
- **I6 Timestamp fidelity:** the output's embedded timestamp equals
  `ctx.timestamp`.

Generators: fast-check produces random schemes, hosts, path segments, query
params, and fragments, plus edge cases (empty path, trailing slash, already
-archived URLs, protocol-relative `//host/path`, mixed case schemes).

### 4.4 Edge cases the rewriter must handle
- Protocol-relative URLs (`//cdn.example.com/x.js`): resolve against the page
  URL's scheme, then prefix.
- Already-archived with a different timestamp: re-point to `ctx.timestamp`
  (I6), still idempotent for the same timestamp.
- `srcset`: split on commas into (url, descriptor) pairs, rewrite each url,
  re-join. Descriptors are preserved verbatim.
- CSS `url(...)`: extract the inner URL (with or without quotes), rewrite, put
  it back with the original quoting.

## 5. Capture selection (core/capture-select.ts)
- Input: parsed CDX rows (`[urlkey, timestamp, original, mimetype, statuscode,
  digest, length]`).
- `selectBest(rows)`: filter to `statuscode === 200`, sort by timestamp
  descending, return the first. (R2.2)
- `lastWorking(rows)`: same filter, return the most recent — used for the
  certificate even if the user later picks an earlier capture. (R2.5)
- If no 200 rows, return `{ best: null, fallback: mostRecentAny }` so the UI can
  offer a best-effort non-200 capture. (R2.3)
- `byDate(rows)`: de-duplicated, sorted list for the capture picker. (R2.4)

## 6. Recovery accounting (core/recovery.ts)
- Input: the list of `AssetResult`s produced while rewriting + checking.
- `recovered = assets.filter(a => a.status === 'recovered').length`.
- `total = assets.length`.
- `recoveryPercent = total === 0 ? 100 : Math.round(recovered / total * 100)`.
- `unknown` and `missing` never count as recovered (R4.4, R8.6).
- Grouping for the report: bucket missing assets by `kind` (R4.5).

## 7. DOM rewriting (dom/rewrite-document.ts)
- Walk these attributes: `a[href]`, `link[href]`, `script[src]`, `img[src]`,
  `img[srcset]`, `source[src]`, `source[srcset]`, `video[poster]`,
  `audio[src]`, `iframe[src]`, `object[data]`, `embed[src]`, inline `style`
  attributes, and `<style>` text content.
- Each URL goes through `core/url-rewriter.rewrite`. The DOM layer never builds
  archive URLs itself.
- `<base>` tags are removed or neutralised so they cannot redirect resolution
  off the archive.
- Internal `<a>` clicks are intercepted by the app shell (not here) to re-run
  recovery (R3.8).

## 8. Restored view sandboxing (ui/RestoredPane.tsx)
- The rewritten HTML is rendered in an `<iframe sandbox>` with a restrictive
  policy: allow same-origin document rendering and scripts only as needed for
  Ruffle, deny top-level navigation and form submission to arbitrary origins.
- Archived content is untrusted input (R9.2). The sandbox is the trust
  boundary. Links inside post messages to the shell to trigger re-recovery.

## 9. Flash via Ruffle (dom/flash.ts)
- Detect `<object>/<embed>` referencing `.swf` and bare `.swf` links.
- For each, check capture status. If recovered, mount a Ruffle player against
  the archived raw `.swf` URL. If missing, render the plain "not saved" notice
  (R6.3).
- Ruffle is loaded once from its official distribution and reused. A load or
  init failure shows a plain error and does not break the rest of the page
  (R6.5).

## 10. Reader view (dom/reader.ts)
- Run readability on a clone of the parsed DOM (readability mutates its input).
- Rewrite asset URLs in the extracted content with the same rewriter (R7.4).
- If no article is found, show the plain "no readable article" notice and keep
  the restored view (R7.3).

## 11. Error states

| State            | Trigger                                   | Behaviour (req)                                                                 |
|------------------|-------------------------------------------|---------------------------------------------------------------------------------|
| Invalid URL      | input fails URL validation                | inline message, no network call (R1.2)                                          |
| No captures      | CDX returns zero rows                      | "no contact" panel, next steps (R8.1)                                           |
| No working capture | rows exist, none are 200                 | explain saved-but-never-OK, offer best-effort non-200 (R2.3)                    |
| Slow archive     | response exceeds soft threshold           | show progress; hard timeout aborts the request (R8.2)                           |
| Rate limited     | 429 or archive throttling signal          | bounded backoff + retry, visible countdown, give up with plain message (R8.3)   |
| Archive outage   | network error or 5xx                      | state it is archive/network side, offer retry (R8.4)                            |
| Partial recovery | some assets missing/unknown               | render what loaded, show recovered vs missing counts (R8.5, R4.3)               |
| Flash missing    | `.swf` has no capture                     | plain "not saved" notice, rest of page renders (R6.3)                           |
| Ruffle failure   | Ruffle load/init throws                    | plain error, rest of page renders (R6.5)                                        |

### Timeout / retry policy
- Per-request hard timeout (e.g. 8s) in the proxy and the client.
- Retries only on 429 and transient 5xx/network errors. Exponential backoff
  with jitter, capped attempts (e.g. 3). No retry on 4xx other than 429.
- The proxy sets a descriptive User-Agent and respects `Retry-After` when
  present.

## 12. Testing strategy
- `core/` has full unit coverage; `url-rewriter` additionally has the fast-check
  property suite for I1–I6.
- `capture-select` and `recovery` are tested with crafted CDX fixtures,
  including the no-200 and empty cases.
- `dom/rewrite-document` is tested against `linkedom` using fixture HTML, and
  asserts confinement: after a full-document rewrite, no element references a
  non-archive host.
- No test performs real network I/O (N2).

## 13. Deployment
- Static bundle from `vite build`, served on a free static host.
- `api/` deployed as the host's serverless function. Stateless; optional short
  edge cache on CDX responses only.
