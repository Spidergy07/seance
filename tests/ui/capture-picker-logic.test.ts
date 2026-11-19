// Task 30: capture picker. Pure grouping logic — captures by year, newest
// first, each year's captures newest first — so the picker (year, then date)
// is testable without rendering.

import { describe, it, expect } from 'vitest';
import { groupCapturesByYear } from '../../src/ui/capture-picker-logic.js';
import { selectByTimestamp, parseCdxRows, type CdxRow } from '../../src/core/capture-select.js';
import mixedRows from '../fixtures/cdx/mixed.json';
import type { Capture } from '../../src/core/types.js';

function capture(timestamp: string): Capture {
  return { originalUrl: 'http://x/', timestamp, statusCode: 200, mimeType: '' };
}

describe('selectByTimestamp', () => {
  it('returns the capture with the exact timestamp, or null', () => {
    const rows = parseCdxRows(mixedRows as CdxRow[]);
    expect(selectByTimestamp(rows, '20050101000000')?.timestamp).toBe(
      '20050101000000',
    );
    expect(selectByTimestamp(rows, '19990101000000')).toBeNull();
  });
});

describe('groupCapturesByYear', () => {
  it('groups by year, newest year first, newest capture first', () => {
    const groups = groupCapturesByYear([
      capture('20040325185740'),
      capture('20060626144354'),
      capture('20040101000000'),
      capture('20061230000000'),
    ]);

    expect(groups.map((g) => g.year)).toEqual(['2006', '2004']);
    expect(groups[0]?.captures.map((c) => c.timestamp)).toEqual([
      '20061230000000',
      '20060626144354',
    ]);
    expect(groups[1]?.captures.map((c) => c.timestamp)).toEqual([
      '20040325185740',
      '20040101000000',
    ]);
  });

  it('returns an empty list for no captures', () => {
    expect(groupCapturesByYear([])).toEqual([]);
  });
});
