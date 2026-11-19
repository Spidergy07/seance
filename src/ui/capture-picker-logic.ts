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
 * Collapse captures to one per calendar day (R2.6), so the picker does not list
 * the same date several times. For each day it prefers a working (status-200)
 * capture, and among those the most recent; when the day has no 200 it keeps
 * the most recent capture of any status. Input is de-duplicated by timestamp
 * via core `byDate` first; the result is newest day first.
 */
export function collapseCapturesByDay(
  captures: readonly Capture[],
): Capture[] {
  const ordered = byDate(captures); // newest first, de-duplicated by timestamp
  const chosen = new Map<string, Capture>();
  for (const capture of ordered) {
    const day = capture.timestamp.slice(0, 8);
    const current = chosen.get(day);
    if (current === undefined) {
      chosen.set(day, capture);
      continue;
    }
    // `ordered` is newest first, so `current` is already the newest seen for
    // the day. Replace it only when it is not a 200 and this one is, to prefer
    // a working capture for the day.
    if (current.statusCode !== 200 && capture.statusCode === 200) {
      chosen.set(day, capture);
    }
  }
  // Map insertion follows `ordered` (newest first), so values keep that order.
  return [...chosen.values()];
}

/**
 * Group captures by calendar year (from the first four timestamp digits).
 * Years are ordered newest first, and captures within a year newest first, so
 * the picker leads with the most recent options. Collapses to one capture per
 * day first (R2.6), so a date is never repeated.
 */
export function groupCapturesByYear(
  captures: readonly Capture[],
): CaptureYear[] {
  const ordered = collapseCapturesByDay(captures); // newest first, one per day
  const byYear = new Map<string, Capture[]>();
  for (const capture of ordered) {
    const year = capture.timestamp.slice(0, 4);
    (byYear.get(year) ?? byYear.set(year, []).get(year)!).push(capture);
  }
  return [...byYear.keys()]
    .sort((a, b) => b.localeCompare(a))
    .map((year) => ({ year, captures: byYear.get(year) ?? [] }));
}
