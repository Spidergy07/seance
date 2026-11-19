// The capture picker (the "séance dial"): choose a year, then a saved date, and
// open that older capture. Some content — notably archived Flash — only exists
// in older captures, and the newest capture is not always the most complete, so
// the visitor needs a way to step back in time (task 30, R2.4).
//
// Built from two native <select> controls and a button, so it is keyboard
// operable and works at 375px without custom widget code. Grouping is the pure
// `groupCapturesByYear`; this file only renders and reports the choice.

import { useMemo, useState } from 'react';
import type { Capture } from '../core/types.js';
import { groupCapturesByYear } from './capture-picker-logic.js';
import { formatCaptureDate } from './format.js';

export interface CapturePickerProps {
  /** All captures of the page, newest first (from the recovery view). */
  captures: Capture[];
  /** The timestamp currently shown, so the control can mark it. */
  selectedTimestamp: string;
  /** Open the capture with this timestamp. */
  onPick: (timestamp: string) => void;
}

export function CapturePicker({
  captures,
  selectedTimestamp,
  onPick,
}: CapturePickerProps) {
  const years = useMemo(() => groupCapturesByYear(captures), [captures]);

  const selectedYear = selectedTimestamp.slice(0, 4);
  const [year, setYear] = useState<string>(
    years.some((y) => y.year === selectedYear)
      ? selectedYear
      : (years[0]?.year ?? ''),
  );
  const [timestamp, setTimestamp] = useState<string>(selectedTimestamp);

  if (captures.length <= 1) {
    // Nothing to choose between: a picker would only add noise.
    return null;
  }

  const yearCaptures =
    years.find((y) => y.year === year)?.captures ?? [];

  const handleYear = (nextYear: string) => {
    setYear(nextYear);
    const first = years.find((y) => y.year === nextYear)?.captures[0];
    if (first) {
      setTimestamp(first.timestamp);
    }
  };

  return (
    <section className="picker" aria-labelledby="picker-title">
      <h2 id="picker-title" className="picker__title">
        Reach an older copy{' '}
        <span className="picker__literal">— pick a saved date to open</span>
      </h2>
      <p className="picker__note">
        {captures.length} saved copies in the Internet Archive. Some content,
        such as Flash, only exists in older copies.
      </p>
      <div className="picker__controls">
        <label className="picker__field">
          <span className="picker__label">Year</span>
          <select
            className="picker__select"
            value={year}
            onChange={(e) => handleYear(e.target.value)}
          >
            {years.map((y) => (
              <option key={y.year} value={y.year}>
                {y.year} ({y.captures.length})
              </option>
            ))}
          </select>
        </label>

        <label className="picker__field">
          <span className="picker__label">Saved date</span>
          <select
            className="picker__select"
            value={timestamp}
            onChange={(e) => setTimestamp(e.target.value)}
          >
            {yearCaptures.map((c) => (
              <option key={c.timestamp} value={c.timestamp}>
                {formatCaptureDate(c.timestamp)}
                {c.timestamp === selectedTimestamp ? ' (showing now)' : ''}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="picker__open"
          onClick={() => onPick(timestamp)}
          disabled={timestamp === selectedTimestamp}
        >
          Open this copy
        </button>
      </div>
    </section>
  );
}
