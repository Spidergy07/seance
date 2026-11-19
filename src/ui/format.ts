// Pure formatting helpers for the UI. Dates are absolute and explicit, in the
// form "3 March 2008" (voice.md). Month names are fixed here rather than taken
// from the host locale, so the output is deterministic and testable under Node.

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const TIMESTAMP_RE = /^\d{14}$/;

/**
 * Format a 14-digit Wayback timestamp (YYYYMMDDhhmmss) as a plain absolute
 * date, e.g. `20080303120000` → "3 March 2008". The day has no leading zero.
 * A malformed timestamp is returned unchanged rather than guessed at.
 */
export function formatCaptureDate(timestamp: string): string {
  if (!TIMESTAMP_RE.test(timestamp)) {
    return timestamp;
  }
  const year = timestamp.slice(0, 4);
  const month = Number.parseInt(timestamp.slice(4, 6), 10);
  const day = Number.parseInt(timestamp.slice(6, 8), 10);
  const monthName = MONTHS[month - 1];
  if (monthName === undefined || day < 1 || day > 31) {
    return timestamp;
  }
  return `${day} ${monthName} ${year}`;
}
