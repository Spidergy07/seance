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
