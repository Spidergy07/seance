// Task 29: do not call a recently-live site dead. A pure classifier compares a
// capture timestamp to a reference "now" (injected, so the test is
// deterministic and the module stays side-effect free).

import { describe, it, expect } from 'vitest';
import {
  classifyLiveness,
  RECENTLY_ALIVE_DAYS,
} from '../../src/core/liveness.js';

// Fixed reference point: 19 November 2026, 12:00:00 UTC.
const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

describe('classifyLiveness', () => {
  it('treats a capture within the last 30 days as recently alive', () => {
    // 17 November 2026 — two days before NOW.
    const result = classifyLiveness('20261117000000', NOW);
    expect(result.recentlyAlive).toBe(true);
    expect(result.daysSinceLastWorking).toBe(2);
  });

  it('treats a capture older than 30 days as not recently alive', () => {
    // 3 March 2008 — long dead.
    const result = classifyLiveness('20080303120000', NOW);
    expect(result.recentlyAlive).toBe(false);
    expect(result.daysSinceLastWorking).toBeGreaterThan(RECENTLY_ALIVE_DAYS);
  });

  it('uses a 30-day threshold at the boundary', () => {
    const justInside = new Date(NOW - (RECENTLY_ALIVE_DAYS - 1) * DAY);
    const justOutside = new Date(NOW - (RECENTLY_ALIVE_DAYS + 1) * DAY);
    expect(classifyLiveness(toTimestamp(justInside), NOW).recentlyAlive).toBe(true);
    expect(classifyLiveness(toTimestamp(justOutside), NOW).recentlyAlive).toBe(false);
  });

  it('returns not-alive and null days for a missing or malformed timestamp', () => {
    expect(classifyLiveness(null, NOW)).toEqual({
      recentlyAlive: false,
      daysSinceLastWorking: null,
    });
    expect(classifyLiveness('not-a-timestamp', NOW).recentlyAlive).toBe(false);
  });
});

/** Build a 14-digit Wayback timestamp (UTC) from a Date, for the test. */
function toTimestamp(date: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    p(date.getUTCFullYear(), 4) +
    p(date.getUTCMonth() + 1) +
    p(date.getUTCDate()) +
    p(date.getUTCHours()) +
    p(date.getUTCMinutes()) +
    p(date.getUTCSeconds())
  );
}
