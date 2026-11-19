# Design & Voice: the seance theme

The theme is a lens for explaining real state, not decoration. If a spooky
element does not map to something the user needs to understand, cut it.

## The core metaphor
A dead website is treated as a departed subject we are trying to contact
through the archive. Each themed element has a job:

| Themed element      | Real meaning                                             |
|---------------------|----------------------------------------------------------|
| Seance / contacting | Querying the Wayback Machine for captures                |
| Death certificate   | The recovery report panel                                |
| Died on             | Date of the last good (HTTP 200) capture                 |
| Recovery %          | Share of referenced assets that loaded from the archive  |
| Missing spirits     | Assets with no capture or a failed capture               |
| Ouija / planchette  | The URL input and submit action                          |
| Veil / the other side | The archive itself (archive.org)                       |

Rule: a user who ignores the theme entirely must still understand exactly what
happened. The plain meaning is always present next to the themed label.

## Copy rules
- Plain English. Short sentences. One idea per sentence.
- No hype words: no "magic", "instantly", "seamless", "effortless",
  "revolutionary", "powerful", "amazing", "blazing", "unlock", "supercharge".
- State facts with numbers: "12 of 47 assets could not be recovered", not
  "most assets were recovered".
- Name the mechanism when it helps: "from the Internet Archive", "played with
  Ruffle".
- Errors say what happened, why, and what the user can do next. Never blame the
  user.
- Theme flavour is allowed in headings and labels, but every themed label is
  paired with a literal one. Example:
  - Heading: "Death certificate"
  - Subtext: "What we recovered and what we could not."
- Dates are absolute and explicit: "Last working capture: 3 March 2008".
- Never claim success you cannot verify. If an asset's status is unknown, say
  "unknown", not "recovered".

## Example strings
- Input placeholder: "Paste the address of a site that no longer loads"
- Button: "Hold the seance" (subtext on hover/aria-label: "Search the archive")
- Empty result: "No contact. The Internet Archive has no saved copy of this
  address." Followed by: try another URL, or check the spelling.
- Partial: "Partial contact. 34 of 41 assets recovered. 7 could not be reached."
- Rate limited: "The archive is busy and asked us to slow down. Waiting a
  moment, then trying again." (shows retry countdown)
- Outage: "We could not reach the Internet Archive right now. This is on their
  side or the network, not your URL. Try again shortly."
- Flash found: "This page contains Flash. Playing it with Ruffle." 
- Flash missing: "This page referenced a Flash file, but no copy was saved. It
  cannot be played."

## Visual design
- Mood through colour, type, and spacing, not through logos or mascots.
- Dark background, candle-like warm accent for live/recovered state, cold
  grey/blue for missing state. Colour encodes recovery status, so it carries
  information, not just atmosphere.
- Recovery percentage shown as both a number and a simple meter.
- Two panes, clearly labelled "Restored" and "Reader". On a narrow screen they
  stack; Reader comes first because it is the readable one.
- Motion is minimal and never blocks reading. Any animation must be skippable
  and respect `prefers-reduced-motion`.
- Accessibility: every themed label has an accessible literal name; colour is
  never the only signal (pair with text/icons); keyboard operable.

## Legal / brand constraints
- No third-party logos or trademarks anywhere in the UI.
- Credit the Internet Archive and Ruffle in plain text in an "About / credits"
  area. Plain names only, no marks.
- Do not imply endorsement by the Internet Archive or the Ruffle project.
