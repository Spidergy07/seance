# Demo URLs

Brand-safe demo pages for the Seance video, found with the local Wayback MCP
server (`tools/wayback-mcp/`). All are U.S. government (NASA) educational sites
from the 1999–2007 era, so their content is public domain and carries no
third-party logos, trademarks, or characters.

## How these were found

The three MCP tools (`cdx_search`, `find_swf`, `check_capture`) were run against
the live Internet Archive through `tools/wayback-mcp/scripts/demo-probe.ts`,
which calls the exact same functions the MCP server exposes and counts every
archive request. The hunt used **12 archive requests total** (budget: 25), run
sequentially. Dates below are computed from real CDX rows, not guessed.

## 1. Flash demo (and capture picker): NASA Kids

- URL: `http://kids.msfc.nasa.gov/`
- Last working capture of the real site (the "died on" date): **12 April 2006**
  (timestamp `20060412014409`, HTTP 200, CDX digest `HU24…`).
- What the archive actually holds (checked live with the Wayback MCP server and
  a few one-shot CDX/snapshot requests on 20 November 2026):
  - The real NASA Kids homepage — the one that embeds the Flash — was captured
    from 2005 until **12 April 2006** (all sharing CDX digest `HU24…`, ~1.5 KB
    of HTML with two `<object>/<embed>` Flash movies).
  - From **15 April 2006** the URL served a 714-byte JavaScript redirect stub
    (`window.location.href='http://www.nasa.gov/audience/forkids/kidsclub/flash/index.html'`,
    CDX digest `CGDP…`). That stub kept returning **HTTP 200** until
    **20 December 2011**, after which captures are 301 redirects and revisits.
  - So "most recent 200" is the redirect stub, not the real site. An earlier
    draft of this file guessed 26 September 2007 as the death date; that is also
    the stub, not real content.
- How Seance handles it now (task 51, R2.7): the redirect-stub rule recognises
  that the newest 200 is a bare redirect stub and selects the most recent
  real-content capture instead, for both the default view and the death date.
  So the certificate reads **12 April 2006**, and the default Restored pane
  shows the real Flash homepage rather than a page that bounces to nasa.gov.
- Flash: the real homepage embeds two movies,
  `http://kids.msfc.nasa.gov/HPAgain3.swf?inclub=&canlogin=` and
  `HPAgain4.swf?inclub=&canlogin=`. `HPAgain3.swf` has a confirmed 200 capture
  at `20051230162231` (`application/x-shockwave-flash`), and the `/api/swf`
  proxy serves its bytes (FWS, 32,896 bytes). The embeds size the stage at
  `width="90%" height="90%"`, so task 50 adds a stage-height rule and a Ruffle
  base so the player is not collapsed to a thin strip.

Demo script: paste `http://kids.msfc.nasa.gov/`. The default view is now the
real homepage (captured 12 April 2006) with the Flash; the certificate reads
"died 12 April 2006". Use "Reach an older copy" to browse other captures,
including the 30 December 2005 one.

## 2. Plain HTML death certificate: NASA Spacelink

- URL: `http://spacelink.nasa.gov/`
- Last working capture (the "died on" date): **31 January 2005**
  (timestamp `20050131090634`, HTTP 200).
- Captures run from 1999 to early 2005, then stop returning 200, so the
  certificate shows a clear, real death date. NASA Spacelink was a discontinued
  NASA education resource.
- Why this page: a plain, text-and-image page with a clean death date and no
  Flash, good for showing the death certificate and a partial recovery. The
  exact recovery percentage and which images are missing are computed live by
  the app; confirm them in the browser (see below).

## Fallback / spare

- `http://www.nasa.gov/returntoflight/` still returns HTTP 200 as recently as
  2023 (it resolves to current NASA content), so Seance would treat it as
  "still answering recently", not dead. Kept here only as a negative example of
  what not to use for a "died" demo.

## Needs a human in a real browser (run `npm run dev`)

- NASA Kids: the default view shows the real 12 April 2006 homepage (not the
  redirect stub), the certificate reads "died 12 April 2006", and
  `HPAgain3.swf` plays via Ruffle inside the sandboxed restored frame — the
  stage is visible (not a thin strip) and the player paints (WebAssembly load +
  playback can only be confirmed in a browser).
- NASA Spacelink: the certificate reads "died 31 January 2005", and the
  recovery percentage and missing-asset list reflect what actually loaded.
- Both: the restored page fits the pane at 375px and in the desktop pane; the
  reader view is legible on a narrow screen.
