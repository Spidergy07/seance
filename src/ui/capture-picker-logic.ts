// Pure logic for the capture picker: group the page's captures by year so the
// visitor can choose a year and then a capture date (task 30, R2.4). No DOM,
// no React here, so the grouping is tested directly. The input is expected to
// be the de-duplicated, newest-first list from core `byDate`.

import { byDate } from '../core/capture-select.js';
import type { Capture } from '../core/types.js';

export interface CaptureYear {
  /** Four-digit year, e.g. "2006". */
  year: string;
  /** Captures in that year, newest first. */
  captures: Capture[];
}

/**
 * Group captures by calendar year (from the first four timestamp digits).
 * Years are ordered newest first, and captures within a year newest first, so
 * the picker leads with the most recent options. De-duplicates by timestamp
 * via core `byDate` first.
 */
export function groupCapturesByYear(
  captures: readonly Capture[],
): CaptureYear[] {
  const ordered = byDate(captures); // newest first, de-duplicated
  const byYear = new Map<string, Capture[]>();
  for (const capture of ordered) {
    const year = capture.timestamp.slice(0, 4);
    (byYear.get(year) ?? byYear.set(year, []).get(year)!).push(capture);
  }
  return [...byYear.keys()]
    .sort((a, b) => b.localeCompare(a))
    .map((year) => ({ year, captures: byYear.get(year) ?? [] }));
}
