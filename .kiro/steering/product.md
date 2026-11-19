# Product: Seance

## Purpose
Seance brings dead websites back to life. A user pastes the URL of a site that
no longer loads. Seance finds the closest working capture in the Internet
Archive Wayback Machine, rewrites the page so links and assets resolve against
the archive, reports what could not be recovered, and displays the restored
page beside a cleaned, mobile-readable version.

The goal is a working, honest restoration: show what survived, name what did
not, and never pretend a broken asset is fine.

## Who it is for
- People who lost a personal or small-business site and want to see it again.
- Researchers and journalists checking what a page used to contain.
- Anyone following a dead link who wants the original page, not a 404.

These users are not expected to know what the Wayback Machine, a CDX query, or
Flash is. The app does that work for them.

## What it does (in scope)
- Accept one URL and validate it.
- Query the Wayback Machine CDX API for captures of that URL.
- Pick the closest working capture (default: most recent capture that returned
  HTTP 200), with the option to pick an earlier one.
- Fetch the archived HTML and rewrite links, images, stylesheets, scripts, and
  media so they load from the archive instead of the dead origin.
- Detect assets that cannot be recovered (no capture, or capture returned an
  error) and list them in a recovery report.
- Play archived Flash (`.swf`) files through Ruffle, the open-source WASM Flash
  emulator, loaded from its official distribution.
- Show two views side by side: the restored page, and a cleaned
  reader-friendly version that works on a phone.
- Show a "death certificate" panel: the date of the last good capture (when the
  site effectively died), a recovery percentage, and the list of missing
  assets.

## What it does not do (out of scope)
- No crawling or archiving of live sites. Seance only reads from the Wayback
  Machine; it does not create new captures.
- No full-site mirroring. Seance restores one page at a time. Following an
  internal link loads that page through the same flow, but there is no bulk
  download.
- No account system, no saved history, no server-side database.
- No editing or "fixing" of page content beyond URL rewriting and the reader
  cleanup. Seance does not rewrite broken JavaScript behaviour.
- No scraping of sites that block the Wayback Machine, and no attempt to bypass
  robots or access controls.
- No third-party logos or trademarks in the UI. The Internet Archive and Ruffle
  are credited in plain text where attribution is required, without their
  marks.

## Success criteria for the hackathon build
- Paste a known dead URL, get a restored page that visibly loads archived
  assets from the archive prefix.
- The death certificate shows a real last-good-capture date and a recovery
  percentage computed from actual asset results.
- At least one archived `.swf` plays through Ruffle.
- The reader view is legible on a narrow screen.
- Clear, non-decorative messaging for every failure state (no captures,
  partial captures, archive outage or rate limit, Flash missing).

## Theme rationale
The seance framing is functional, not ornament. "Contacting the site" is the
archive lookup. The "death certificate" is the recovery report. "Missing
spirits" are unrecoverable assets. Every spooky element maps to a real piece of
state the user needs to understand. See `voice.md` for the rules that keep the
theme from turning into empty decoration.
