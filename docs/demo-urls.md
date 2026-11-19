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
- Last working capture (the "died on" date): **26 September 2007**
  (timestamp `20070926030055`, HTTP 200).
- Flash-bearing capture: **30 December 2005** (`20051230162224`). That capture
  embeds two Flash files on the home page:
  - `http://kids.msfc.nasa.gov/HPAgain3.swf?inclub=&canlogin=`
  - `http://kids.msfc.nasa.gov/HPAgain4.swf?inclub=&canlogin=`
- `HPAgain3.swf` has a confirmed working capture at `20051230162231`, HTTP 200,
  content type `application/x-shockwave-flash`, so Ruffle has real Flash bytes
  to play.
- Why this page: it shows two features at once. The default view (the newest
  working capture, 2007) is a plain page with **no Flash**; the 2005 captures
  do have Flash. So the demo exercises the capture picker (task 30): open the
  page, then pick the **2005** capture to see Flash play through Ruffle. The
  `find_swf` 2007 scan returned zero `.swf`, confirming the newest capture has
  no Flash, which is why the picker matters here.

Demo script: paste `http://kids.msfc.nasa.gov/`, read the certificate (died 26
September 2007), then use "Reach an older copy" to open a 30 December 2005
capture and watch the Flash play.

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

- NASA Kids: the 30 December 2005 capture renders, the certificate reads "died
  26 September 2007", and `HPAgain3.swf` plays via Ruffle inside the sandboxed
  restored frame (WebAssembly load + playback can only be confirmed in a
  browser).
- NASA Spacelink: the certificate reads "died 31 January 2005", and the
  recovery percentage and missing-asset list reflect what actually loaded.
- Both: the restored page fits the pane at 375px and in the desktop pane; the
  reader view is legible on a narrow screen.
