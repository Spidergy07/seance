# Seance — Requirements

Acceptance criteria use EARS keywords (WHEN / WHILE / IF / WHERE / THE SYSTEM
SHALL). Each requirement has an ID used by `tasks.md`.

## Glossary
- **Capture**: one archived snapshot of a URL at a timestamp, from the Wayback
  Machine CDX index.
- **Working capture**: a capture whose archived status code is 200.
- **Archive prefix**: the Wayback URL prefix that fronts an archived resource,
  of the form `https://web.archive.org/web/<timestamp>/`. For raw (un-rewritten
  by the archive) resources the `id_` modifier may be used:
  `https://web.archive.org/web/<timestamp>id_/`.
- **Recovery percentage**: recovered assets divided by total referenced assets,
  as a whole-number percent.

---

## R1 — Submit a URL
**User story:** As a visitor, I want to paste a dead site's URL and start a
recovery, so that I can see the page again.

- R1.1 WHEN the user submits a non-empty string, THE SYSTEM SHALL validate it
  as an absolute http(s) URL before any network call.
- R1.2 IF the input is not a valid absolute http(s) URL, THE SYSTEM SHALL show
  an inline message naming the problem and SHALL NOT make a network call.
- R1.3 WHEN the input is missing a scheme but is otherwise a plausible host
  (e.g. `example.com/page`), THE SYSTEM SHALL offer to interpret it as `https://`
  and SHALL show the interpreted URL before searching.
- R1.4 WHILE a recovery is in progress, THE SYSTEM SHALL disable the submit
  control and SHALL show a themed progress state with a literal status line.

## R2 — Find the closest working capture
**User story:** As a visitor, I want Seance to find the best saved copy, so
that I do not have to understand the archive myself.

- R2.1 WHEN a valid URL is submitted, THE SYSTEM SHALL query the Wayback CDX
  API (through our proxy) for captures of that URL.
- R2.2 THE SYSTEM SHALL select, by default, the most recent working capture
  (status 200).
- R2.3 IF no working capture exists but non-200 captures exist, THE SYSTEM
  SHALL report that the page was saved but never with a successful status, and
  SHALL offer the most recent non-200 capture as a best effort.
- R2.4 WHERE multiple captures exist, THE SYSTEM SHALL let the user pick an
  earlier capture by date.
- R2.5 THE SYSTEM SHALL record the timestamp of the selected capture and the
  timestamp of the last working capture for the death certificate.
- R2.6 WHERE the capture picker lists saved dates, THE SYSTEM SHALL show at most
  one entry per calendar day by default, choosing a working (status-200) capture
  for that day when one exists, so the same date is not repeated. The control
  SHALL stay keyboard operable.

## R3 — Restore the page (link/asset rewriting)
**User story:** As a visitor, I want the restored page's links and assets to
load from the archive, so that it looks and works like the original.

- R3.1 WHEN the archived HTML is fetched, THE SYSTEM SHALL rewrite every
  resource reference (`href`, `src`, `srcset`, `poster`, CSS `url(...)`,
  inline-style URLs) so it resolves against the archive prefix.
- R3.2 THE SYSTEM SHALL resolve relative references against the captured page's
  original URL before applying the archive prefix, using the WHATWG URL API.
- R3.3 THE SYSTEM SHALL preserve URL fragments (`#...`) and query strings when
  rewriting.
- R3.4 THE SYSTEM SHALL NOT produce any resource URL that points outside the
  archive prefix (no reference may escape to the live web).
- R3.5 WHEN a reference is already an archive URL, THE SYSTEM SHALL leave it
  effectively unchanged (rewriting is idempotent).
- R3.6 THE SYSTEM SHALL leave non-resolvable schemes (`mailto:`, `tel:`,
  `javascript:`, `data:`, `blob:`, `about:`) untouched.
- R3.7 THE SYSTEM SHALL render the restored page in a sandboxed iframe so
  archived script cannot access the Seance app or the user's archive session.
- R3.8 WHEN the user activates an internal link in the restored page, THE
  SYSTEM SHALL re-run the recovery flow for that link's original URL rather
  than navigating the live web.
- R3.9 THE SYSTEM SHALL keep the restored view on the restored document: it
  SHALL neutralise `<meta http-equiv="refresh">` so the page does not navigate
  itself away, and SHALL present the refresh target as a link that re-runs
  recovery instead. THE SYSTEM SHALL block top-level and self navigation and
  form submission from inside the restored frame from escaping Seance to the
  live web.
- R3.10 THE SYSTEM SHALL rewrite `<frame src>` in archived framesets to the
  archive prefix, like other resource references, so a frameset page renders
  from the archive rather than showing blank frames (R3.4).
- R3.11 THE SYSTEM SHALL remove any archived `<meta http-equiv="Content-Security-Policy">`
  so the original page's policy cannot stop archive-served assets or Seance's
  own in-frame scripts from loading.
- R3.12 WHERE an archived page is wider than the Restored pane (old fixed-width
  layouts, e.g. 500–800px tables or a 550px Flash stage), THE SYSTEM SHALL scale
  the restored document down to fit the pane width, SHALL re-measure and rescale
  on resize, and SHALL only scale down (never enlarge), keeping the content
  readable and Flash interactive.
- R3.13 WHEN an image in the restored view carries no content (its rendered
  size is 1×1 or 0×0, a tracking pixel), THE SYSTEM SHALL hide it. WHEN an
  image in the restored view fails to load, THE SYSTEM SHALL replace it with a
  small styled "not recovered" placeholder rather than leave the browser's
  broken-image icon.
- R3.14 THE SYSTEM SHALL give every notice it injects into the restored
  document (the stopped-redirect note, the Flash notices, the image
  placeholder) a small self-contained style that is readable on both light and
  dark archived pages, so an injected notice is never unstyled default text.

## R4 — Report what could not be recovered
**User story:** As a visitor, I want to know exactly what is missing, so that I
can trust what I am seeing.

- R4.1 WHEN rewriting references, THE SYSTEM SHALL record each referenced asset
  and whether a capture exists for it.
- R4.2 IF an asset has no capture, or its capture returns a non-200 status,
  THE SYSTEM SHALL mark it as not recovered and SHALL list its original URL.
- R4.3 THE SYSTEM SHALL compute a recovery percentage from recovered assets
  over total referenced assets and SHALL show both the count and the percent.
- R4.4 WHERE an asset's status cannot be determined, THE SYSTEM SHALL mark it
  "unknown" and SHALL NOT count it as recovered.
- R4.5 THE SYSTEM SHALL group missing assets by type (image, stylesheet,
  script, media, other) in the report.
- R4.6 WHERE an asset's archived lookup yields only redirects (3xx) or other
  non-200 responses, THE SYSTEM SHALL report it as not recovered. Only a
  working (status-200) capture counts as recovered.

## R5 — Death certificate panel
**User story:** As a visitor, I want a clear summary of when the site died and
how much came back, so that I get the headline facts at a glance.

- R5.1 THE SYSTEM SHALL show the date of the last working capture, labelled in
  plain language (e.g. "Last working capture: 3 March 2008").
- R5.2 THE SYSTEM SHALL show the recovery percentage as a number and a meter.
- R5.3 THE SYSTEM SHALL show the count of missing assets and SHALL link to the
  full missing-asset list.
- R5.4 THE SYSTEM SHALL show the selected capture's date when it differs from
  the last working capture.
- R5.5 THE SYSTEM SHALL render the certificate without throwing for any recovery
  report, treating an absent (null or undefined) selected or last-working
  capture as "no working capture found" rather than crashing. WHERE any result
  panel throws during render, THE SYSTEM SHALL contain the failure in an error
  boundary that shows a plain message with a retry control, not a blank page.

## R6 — Flash playback with Ruffle
**User story:** As a visitor, I want archived Flash content to play, so that
interactive or animated pages are not dead.

- R6.1 WHEN the archived page references a `.swf` file, THE SYSTEM SHALL attempt
  to play it with Ruffle, loaded from Ruffle's official distribution.
- R6.2 IF the `.swf` has a working capture, THE SYSTEM SHALL mount a Ruffle
  player pointed at the archived `.swf` URL.
- R6.3 IF the `.swf` has no capture, THE SYSTEM SHALL mark it as not recovered
  and SHALL show the plain message that the Flash file was not saved.
- R6.4 THE SYSTEM SHALL run Ruffle within the sandboxed restored view and SHALL
  not require any browser plugin.
- R6.5 IF Ruffle fails to load or initialise, THE SYSTEM SHALL show a plain
  error and SHALL continue to render the rest of the page.
- R6.6 THE SYSTEM SHALL serve archived `.swf` bytes to the in-frame Ruffle
  player through its own same-origin proxy endpoint that sends
  `Access-Control-Allow-Origin: *`, because the restored iframe runs in an
  opaque origin and the archive does not send CORS headers for raw `.swf`
  bytes. The proxy SHALL fetch only from `web.archive.org` and SHALL reject any
  other host, so it is not an open proxy. THE SYSTEM SHALL rewrite `.swf`
  `object`/`embed`/`param` references to that endpoint using an absolute URL on
  the app's own origin, and the endpoint's target SHALL remain an archive URL
  (confinement is preserved via the proxy).
- R6.7 IF Ruffle fails on a very small embed, THE SYSTEM SHALL degrade to the
  plain "not saved / could not play" notice rather than leaving a clipped error
  strip, and SHALL suppress Ruffle's own unsupported-content warning UI inside
  the restored frame.

## R7 — Reader view
**User story:** As a visitor on a phone, I want a clean readable version, so
that I can read the content without broken layout.

- R7.1 THE SYSTEM SHALL extract the page's main content and render a reader
  view using a readability extraction step.
- R7.2 THE SYSTEM SHALL show the restored view and the reader view together on
  wide screens, and SHALL stack them (reader first) on narrow screens.
- R7.3 IF readability extraction finds no article content, THE SYSTEM SHALL say
  so plainly and SHALL still show the restored view.
- R7.4 THE SYSTEM SHALL rewrite asset URLs inside the reader view with the same
  rewriter, so reader-view images also load from the archive.

## R8 — Error and edge states
**User story:** As a visitor, I want honest, actionable messages when something
fails, so that I know whether the problem is my URL, the archive, or the asset.

- R8.1 IF the CDX query returns no captures, THE SYSTEM SHALL show the "no
  contact" state explaining the archive has no saved copy, with next steps.
- R8.2 WHILE the archive responds slowly, THE SYSTEM SHALL show progress and
  SHALL apply a request timeout rather than hanging.
- R8.3 IF the archive signals rate limiting, THE SYSTEM SHALL back off and
  retry a bounded number of times, SHALL show a countdown, and SHALL stop with
  a plain message if retries are exhausted.
- R8.4 IF the archive is unreachable or returns a server error, THE SYSTEM
  SHALL state the failure is on the archive/network side, not the user's URL,
  and SHALL offer retry.
- R8.5 WHERE recovery is partial, THE SYSTEM SHALL still render what loaded and
  SHALL make the partial status obvious (count recovered vs. missing).
- R8.6 THE SYSTEM SHALL never present an unrecovered asset as if it loaded.
- R8.7 WHILE resolving which referenced assets were saved, THE SYSTEM SHALL
  bound the archive traffic a single recovery makes: it SHALL check at most a
  small, fixed number of assets against the archive, SHALL run those checks
  with a small concurrency limit, and SHALL mark any asset it did not check
  "unknown" (never recovered, R4.4, R8.6). The aim is under six archive
  requests for a typical page.
- R8.8 THE SYSTEM SHALL cache CDX answers in memory for the session, in the
  browser and in the proxy, so a repeated lookup of the same URL within the
  session makes no new archive request. The proxy cache is ephemeral and keyed
  only by the queried URL; it stores no user identity and nothing durable, so
  it does not breach R9.5.
- R8.9 THE SYSTEM SHALL complete or stop a recovery within a bounded time (about
  20 seconds). WHEN that deadline passes, THE SYSTEM SHALL stop waiting and show
  the slow/timeout or rate-limited state with a retry control, rather than keep
  spinning, and its retries SHALL NOT stack up to minutes.
- R8.10 WHILE a recovery is in progress, THE SYSTEM SHALL show which step is
  running (searching for captures, retrieving the page, rebuilding it, checking
  assets, preparing the reader view), not a single static line.

## R9 — Privacy, safety, and attribution
**User story:** As a visitor, I want the app to be safe and honest about
sources, so that I can use it without risk or confusion.

- R9.1 THE SYSTEM SHALL route all archive traffic through our own proxy and
  SHALL NOT send the user's URL to any third party other than the Internet
  Archive.
- R9.2 THE SYSTEM SHALL treat archived HTML and scripts as untrusted and SHALL
  contain them in a sandboxed iframe.
- R9.3 THE SYSTEM SHALL NOT display third-party logos or trademarks.
- R9.4 THE SYSTEM SHALL credit the Internet Archive and Ruffle in plain text.
- R9.5 THE SYSTEM SHALL NOT persist the user's queries server-side.

## Non-functional
- N1 The core rewriting and selection logic SHALL be pure and covered by unit
  and property-based tests.
- N2 Tests SHALL run offline using fixtures; no test SHALL hit the live
  archive.
- N3 The production build SHALL be a static bundle plus stateless function(s),
  deployable on a free tier.
- N4 The UI SHALL be operable by keyboard and SHALL respect
  `prefers-reduced-motion`.
