// Choose the closest working capture from CDX rows. Pure module: no DOM, no
// network. See design.md §5 and requirements R2.2–R2.5.

import type { Capture } from './types.js';

/**
 * A raw CDX row as returned by the Wayback CDX API with `output=json`:
 * `[urlkey, timestamp, original, mimetype, statuscode, digest, length]`.
 * The first row of a CDX response is a header with these field names.
 */
export type CdxRow = readonly string[];

const TIMESTAMP_RE = /^\d{14}$/;

/**
 * Normalise raw CDX rows into `Capture`s. Skips the header row and any row with
 * a malformed timestamp. A non-numeric status code (e.g. `-` for a revisit
 * record) becomes 0, so it never counts as a working capture.
 */
export function parseCdxRows(rows: readonly CdxRow[]): Capture[] {
  const captures: Capture[] = [];
  for (const row of rows) {
    const timestamp = row[1];
    const original = row[2];
    const mimeType = row[3];
    const statusCode = row[4];
    if (!timestamp || !TIMESTAMP_RE.test(timestamp)) {
      continue; // header row or malformed row
    }
    const status = Number.parseInt(statusCode ?? '', 10);
    captures.push({
      originalUrl: original ?? '',
      timestamp,
      statusCode: Number.isNaN(status) ? 0 : status,
      mimeType: mimeType ?? '',
    });
  }
  return captures;
}

/** The capture with the most recent timestamp, or null if there are none. */
function mostRecent(captures: readonly Capture[]): Capture | null {
  let latest: Capture | null = null;
  for (const capture of captures) {
    if (latest === null || capture.timestamp > latest.timestamp) {
      latest = capture;
    }
  }
  return latest;
}

/**
 * The default selection: the most recent working (status-200) capture, or null
 * if none exists (R2.2).
 */
export function selectBest(captures: readonly Capture[]): Capture | null {
  return mostRecent(captures.filter((c) => c.statusCode === 200));
}

/**
 * The most recent working capture, used for the death certificate's
 * "last working capture" date even if the user later picks an earlier one
 * (R2.5). Same computation as `selectBest`; named separately for intent.
 */
export function lastWorking(captures: readonly Capture[]): Capture | null {
  return selectBest(captures);
}

/**
 * Captures for the date picker: de-duplicated by timestamp and sorted newest
 * first (R2.4).
 */
export function byDate(captures: readonly Capture[]): Capture[] {
  const sorted = [...captures].sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp),
  );
  const seen = new Set<string>();
  const unique: Capture[] = [];
  for (const capture of sorted) {
    if (seen.has(capture.timestamp)) {
      continue;
    }
    seen.add(capture.timestamp);
    unique.push(capture);
  }
  return unique;
}

export interface CaptureSelection {
  /** Most recent status-200 capture, or null if none. */
  best: Capture | null;
  /** Most recent status-200 capture, for the certificate (same as best). */
  lastWorking: Capture | null;
  /**
   * Best-effort capture when there is no working one: the most recent capture
   * of any status, so the UI can offer it (R2.3). Null when `best` exists or
   * there are no captures at all.
   */
  fallback: Capture | null;
}

/**
 * Bundle the selection decisions. When no working capture exists but other
 * captures do, `fallback` holds the most recent non-200 capture (R2.3).
 */
export function selectCapture(captures: readonly Capture[]): CaptureSelection {
  const best = selectBest(captures);
  return {
    best,
    lastWorking: best,
    fallback: best === null ? mostRecent(captures) : null,
  };
}
