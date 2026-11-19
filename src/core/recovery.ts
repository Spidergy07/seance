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
 * The number of assets whose status was actually checked against the archive:
 * `recovered` plus `missing`. An `unknown` asset was not checked (the per
 * -recovery cap left it unchecked, or its lookup was undetermined), so it is
 * not counted here (R8.7, task 53).
 */
export function checkedCount(assets: readonly AssetResult[]): number {
  return assets.filter(
    (a) => a.status === 'recovered' || a.status === 'missing',
  ).length;
}

/**
 * Recovered assets as a whole-number percent of the assets that were actually
 * checked (recovered + missing), not of every referenced asset. Unchecked
 * (`unknown`) assets are excluded from the denominator, so the percent reflects
 * what we verified rather than understating it by counting files we never
 * looked up (task 53). When nothing was checked, there is nothing known to be
 * missing, so the result is 100. Only `recovered` counts toward the numerator
 * (R4.4, R8.6).
 */
export function recoveryPercent(assets: readonly AssetResult[]): number {
  const checked = checkedCount(assets);
  if (checked === 0) {
    return 100;
  }
  const recovered = assets.filter((a) => a.status === 'recovered').length;
  return Math.round((recovered / checked) * 100);
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
