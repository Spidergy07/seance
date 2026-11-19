// Task 30: capture picker. Pure grouping logic — captures by year, newest
// first, each year's captures newest first — so the picker (year, then date)
// is testable without rendering.

import { describe, it, expect } from 'vitest';
import { groupCapturesByYear, collapseCapturesByDay } from '../../src/ui/capture-picker-logic.js';
import { selectByTimestamp, parseCdxRows, type CdxRow } from '../../src/core/capture-select.js';
import mixedRows from '../fixtures/cdx/mixed.json';
import type { Capture } from '../../src/core/types.js';

function capture(timestamp: string, statusCode = 200): Capture {
  return { originalUrl: 'http://x/', timestamp, statusCode, mimeType: '' };
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

describe('collapseCapturesByDay (R2.6)', () => {
  it('keeps one capture per calendar day, preferring a working (200) one', () => {
    // Three captures on the same day: two non-200 and one 200.
    const collapsed = collapseCapturesByDay([
      capture('20261117235959', 301),
      capture('20261117120000', 200),
      capture('20261117000000', 404),
    ]);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]?.timestamp).toBe('20261117120000');
    expect(collapsed[0]?.statusCode).toBe(200);
  });

  it('falls back to the most recent capture when no 200 exists that day', () => {
    const collapsed = collapseCapturesByDay([
      capture('20080303010000', 404),
      capture('20080303090000', 500),
    ]);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]?.timestamp).toBe('20080303090000');
  });

  it('keeps separate days and orders them newest first', () => {
    const collapsed = collapseCapturesByDay([
      capture('20040101120000'),
      capture('20040102090000'),
      capture('20040101060000'),
    ]);
    expect(collapsed.map((c) => c.timestamp)).toEqual([
      '20040102090000',
      '20040101120000',
    ]);
  });

  it('does not repeat the same day in the year grouping', () => {
    const groups = groupCapturesByYear([
      capture('20261117235959', 301),
      capture('20261117120000', 200),
      capture('20261117000000', 404),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.captures).toHaveLength(1);
    expect(groups[0]?.captures[0]?.timestamp).toBe('20261117120000');
  });
});
