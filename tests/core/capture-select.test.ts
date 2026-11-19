import { describe, it, expect } from 'vitest';
import {
  parseCdxRows,
  selectBest,
  lastWorking,
  lastRealCapture,
  byDate,
  selectCapture,
  type CdxRow,
} from '../../src/core/capture-select.js';
import mixedRows from '../fixtures/cdx/mixed.json';
import noWorkingRows from '../fixtures/cdx/no-200.json';

const mixed = parseCdxRows(mixedRows as CdxRow[]);
const noWorking = parseCdxRows(noWorkingRows as CdxRow[]);

describe('parseCdxRows', () => {
  it('skips the header row and parses the rest', () => {
    expect(mixed).toHaveLength(4); // 5 rows minus the header
    expect(mixed[0]).toEqual({
      originalUrl: 'http://example.com/',
      timestamp: '20050101000000',
      statusCode: 200,
      mimeType: 'text/html',
      digest: 'AAAA',
    });
  });

  it('turns a non-numeric status code into 0', () => {
    const rows: CdxRow[] = [
      ['com,example)/', '20200101000000', 'http://example.com/', 'warc/revisit', '-', 'Z', '0'],
    ];
    expect(parseCdxRows(rows)[0]?.statusCode).toBe(0);
  });

  it('returns an empty array for no rows', () => {
    expect(parseCdxRows([])).toEqual([]);
  });

  it('parses the digest field when present (R2.7)', () => {
    expect(mixed[0]?.digest).toBe('AAAA');
    expect(mixed[2]?.digest).toBe('CCCC');
  });
});

describe('lastRealCapture (R2.7)', () => {
  const cap = (timestamp: string, statusCode: number, digest: string) => ({
    originalUrl: 'http://x/',
    timestamp,
    statusCode,
    mimeType: 'text/html',
    digest,
  });

  it('returns the most recent 200 whose digest differs from the stub digest', () => {
    const caps = [
      cap('20111220000000', 200, 'STUB'),
      cap('20110101000000', 200, 'STUB'),
      cap('20060101000000', 200, 'REAL'),
      cap('20050101000000', 200, 'REAL2'),
    ];
    expect(lastRealCapture(caps, 'STUB')?.timestamp).toBe('20060101000000');
  });

  it('ignores non-200 captures', () => {
    const caps = [
      cap('20120101000000', 301, 'XXXX'),
      cap('20111220000000', 200, 'STUB'),
      cap('20060101000000', 200, 'REAL'),
    ];
    expect(lastRealCapture(caps, 'STUB')?.timestamp).toBe('20060101000000');
  });

  it('falls back to the most recent 200 when no digest differs', () => {
    const caps = [
      cap('20111220000000', 200, 'STUB'),
      cap('20110101000000', 200, 'STUB'),
    ];
    expect(lastRealCapture(caps, 'STUB')?.timestamp).toBe('20111220000000');
  });

  it('without a stub digest returns the most recent 200', () => {
    const caps = [
      cap('20111220000000', 200, 'STUB'),
      cap('20060101000000', 200, 'REAL'),
    ];
    expect(lastRealCapture(caps, undefined)?.timestamp).toBe('20111220000000');
  });
});

describe('selectBest / lastWorking', () => {
  it('picks the most recent status-200 capture', () => {
    expect(selectBest(mixed)?.timestamp).toBe('20080303120000');
    expect(lastWorking(mixed)?.timestamp).toBe('20080303120000');
  });

  it('ignores the more recent non-200 capture', () => {
    // 20090101 is a 404, so it must not be selected.
    expect(selectBest(mixed)?.statusCode).toBe(200);
  });

  it('returns null when there is no working capture', () => {
    expect(selectBest(noWorking)).toBeNull();
    expect(lastWorking(noWorking)).toBeNull();
  });

  it('returns null for an empty capture list', () => {
    expect(selectBest([])).toBeNull();
  });
});

describe('selectCapture — fallback', () => {
  it('has no fallback when a working capture exists', () => {
    const selection = selectCapture(mixed);
    expect(selection.best?.timestamp).toBe('20080303120000');
    expect(selection.fallback).toBeNull();
  });

  it('offers the most recent non-200 capture when none is working', () => {
    const selection = selectCapture(noWorking);
    expect(selection.best).toBeNull();
    expect(selection.fallback?.timestamp).toBe('20110101000000');
    expect(selection.fallback?.statusCode).toBe(500);
  });

  it('has no fallback for an empty list', () => {
    expect(selectCapture([])).toEqual({
      best: null,
      lastWorking: null,
      fallback: null,
    });
  });
});

describe('byDate', () => {
  it('is sorted newest first and de-duplicated by timestamp', () => {
    const list = byDate(mixed);
    expect(list.map((c) => c.timestamp)).toEqual([
      '20090101000000',
      '20080303120000',
      '20050101000000',
    ]);
  });
});
