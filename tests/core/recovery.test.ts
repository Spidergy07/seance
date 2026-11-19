import { describe, it, expect } from 'vitest';
import {
  countByStatus,
  recoveryPercent,
  groupMissingByKind,
  buildRecoveryReport,
} from '../../src/core/recovery.js';
import type { AssetResult, AssetStatus, AssetKind, Capture } from '../../src/core/types.js';

function asset(
  status: AssetStatus,
  kind: AssetKind = 'image',
  originalUrl = 'http://example.com/x',
): AssetResult {
  return status === 'recovered'
    ? { originalUrl, kind, status, archiveUrl: 'https://web.archive.org/web/20080303120000id_/' + originalUrl }
    : { originalUrl, kind, status };
}

const capture: Capture = {
  originalUrl: 'http://example.com/',
  timestamp: '20080303120000',
  statusCode: 200,
  mimeType: 'text/html',
};

describe('countByStatus', () => {
  it('counts each status and the total', () => {
    const counts = countByStatus([
      asset('recovered'),
      asset('missing'),
      asset('missing'),
      asset('unknown'),
    ]);
    expect(counts).toEqual({ recovered: 1, missing: 2, unknown: 1, total: 4 });
  });
});

describe('recoveryPercent', () => {
  it('is 100 for an empty asset list', () => {
    expect(recoveryPercent([])).toBe(100);
  });

  it('is 100 when everything is recovered', () => {
    expect(recoveryPercent([asset('recovered'), asset('recovered')])).toBe(100);
  });

  it('rounds to a whole number', () => {
    // 1 of 3 recovered = 33.33% -> 33
    expect(
      recoveryPercent([asset('recovered'), asset('missing'), asset('missing')]),
    ).toBe(33);
    // 2 of 3 recovered = 66.67% -> 67
    expect(
      recoveryPercent([asset('recovered'), asset('recovered'), asset('missing')]),
    ).toBe(67);
  });

  it('never counts unknown or missing as recovered', () => {
    // 1 recovered, 2 unknown -> 33
    expect(
      recoveryPercent([asset('recovered'), asset('unknown'), asset('unknown')]),
    ).toBe(33);
    // all unknown -> 0
    expect(recoveryPercent([asset('unknown'), asset('unknown')])).toBe(0);
  });
});

describe('groupMissingByKind', () => {
  it('buckets missing assets by kind and excludes recovered and unknown', () => {
    const groups = groupMissingByKind([
      asset('missing', 'image'),
      asset('missing', 'image'),
      asset('missing', 'script'),
      asset('recovered', 'stylesheet'),
      asset('unknown', 'media'),
    ]);
    expect(groups.image).toHaveLength(2);
    expect(groups.script).toHaveLength(1);
    expect(groups.stylesheet).toBeUndefined();
    expect(groups.media).toBeUndefined();
  });

  it('returns an empty object when nothing is missing', () => {
    expect(groupMissingByKind([asset('recovered'), asset('unknown')])).toEqual({});
  });
});

describe('buildRecoveryReport', () => {
  it('assembles counts, percent, and the captures', () => {
    const report = buildRecoveryReport({
      selectedCapture: capture,
      lastWorkingCapture: capture,
      assets: [asset('recovered'), asset('missing'), asset('unknown'), asset('recovered')],
    });
    expect(report.recoveredCount).toBe(2);
    expect(report.totalCount).toBe(4);
    expect(report.recoveryPercent).toBe(50);
    expect(report.selectedCapture).toBe(capture);
    expect(report.lastWorkingCapture).toBe(capture);
    expect(report.assets).toHaveLength(4);
  });

  it('reports 100% and zero assets for a page with no references', () => {
    const report = buildRecoveryReport({
      selectedCapture: capture,
      lastWorkingCapture: capture,
      assets: [],
    });
    expect(report.recoveredCount).toBe(0);
    expect(report.totalCount).toBe(0);
    expect(report.recoveryPercent).toBe(100);
  });
});
