// Recovery accounting: counts, percentage, and grouping of the assets that
// could not be recovered. Pure module: no DOM, no network. See design.md §6
// and requirements R4.3–R4.5, R8.6.

import type { AssetKind, AssetResult, Capture, RecoveryReport } from './types.js';

export interface StatusCounts {
  recovered: number;
  missing: number;
  unknown: number;
  total: number;
}

/** Count assets by status. `unknown` and `missing` are never recovered. */
export function countByStatus(assets: readonly AssetResult[]): StatusCounts {
  const counts: StatusCounts = {
    recovered: 0,
    missing: 0,
    unknown: 0,
    total: assets.length,
  };
  for (const asset of assets) {
    counts[asset.status] += 1;
  }
  return counts;
}

/**
 * Recovered assets over total, as a whole-number percent. Empty input is 100%
 * (nothing was referenced, so nothing is missing). Only `recovered` counts
 * toward the numerator (R4.4, R8.6).
 */
export function recoveryPercent(assets: readonly AssetResult[]): number {
  const total = assets.length;
  if (total === 0) {
    return 100;
  }
  const recovered = assets.filter((a) => a.status === 'recovered').length;
  return Math.round((recovered / total) * 100);
}

/** Missing assets grouped by kind, for the recovery report (R4.5). */
export type MissingByKind = Partial<Record<AssetKind, AssetResult[]>>;

/**
 * Group the assets that have no capture (status `missing`) by kind. `unknown`
 * assets are excluded here; they are reported as unknown, not as missing, so
 * the app never claims more certainty than it has.
 */
export function groupMissingByKind(
  assets: readonly AssetResult[],
): MissingByKind {
  const groups: MissingByKind = {};
  for (const asset of assets) {
    if (asset.status !== 'missing') {
      continue;
    }
    (groups[asset.kind] ??= []).push(asset);
  }
  return groups;
}

export interface BuildReportParams {
  selectedCapture: Capture;
  lastWorkingCapture: Capture | null;
  assets: readonly AssetResult[];
}

/** Assemble the full recovery report (the death certificate data). */
export function buildRecoveryReport(params: BuildReportParams): RecoveryReport {
  const assets = [...params.assets];
  const recoveredCount = assets.filter((a) => a.status === 'recovered').length;
  return {
    selectedCapture: params.selectedCapture,
    lastWorkingCapture: params.lastWorkingCapture,
    assets,
    recoveredCount,
    totalCount: assets.length,
    recoveryPercent: recoveryPercent(assets),
  };
}
