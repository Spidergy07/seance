// Liveness: decide whether a site's most recent working capture is recent
// enough that calling the site "dead" would be wrong. Pure module: no DOM, no
// network, and no `Date.now()` — the reference time is passed in, so the result
// is deterministic and testable. See requirements R5.1 and design.md §6.

const TIMESTAMP_RE = /^\d{14}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A capture this recent (in days) or fewer before "now" means the address may
 * still be answering, so Seance does not present a death date (task 29).
 */
export const RECENTLY_ALIVE_DAYS = 30;

export interface Liveness {
  /** True when the last working capture is within `RECENTLY_ALIVE_DAYS`. */
  recentlyAlive: boolean;
  /**
   * Whole days between the last working capture and `now`, or null when there
   * is no usable timestamp. Negative differences (a capture stamped in the
   * future relative to `now`) are clamped to 0.
   */
  daysSinceLastWorking: number | null;
}

/** Parse a 14-digit Wayback timestamp (YYYYMMDDhhmmss, UTC) to epoch ms. */
function timestampToMs(timestamp: string): number | null {
  if (!TIMESTAMP_RE.test(timestamp)) {
    return null;
  }
  const year = Number.parseInt(timestamp.slice(0, 4), 10);
  const month = Number.parseInt(timestamp.slice(4, 6), 10);
  const day = Number.parseInt(timestamp.slice(6, 8), 10);
  const hour = Number.parseInt(timestamp.slice(8, 10), 10);
  const minute = Number.parseInt(timestamp.slice(10, 12), 10);
  const second = Number.parseInt(timestamp.slice(12, 14), 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

/**
 * Classify how recent the last working capture is, relative to `nowMs`
 * (epoch ms). A capture within `RECENTLY_ALIVE_DAYS` means the address may
 * still be live, so the UI should not claim it died (R5.1).
 */
export function classifyLiveness(
  timestamp: string | null,
  nowMs: number,
): Liveness {
  if (timestamp === null) {
    return { recentlyAlive: false, daysSinceLastWorking: null };
  }
  const capturedMs = timestampToMs(timestamp);
  if (capturedMs === null) {
    return { recentlyAlive: false, daysSinceLastWorking: null };
  }
  const days = Math.max(0, Math.floor((nowMs - capturedMs) / DAY_MS));
  return {
    recentlyAlive: days <= RECENTLY_ALIVE_DAYS,
    daysSinceLastWorking: days,
  };
}
