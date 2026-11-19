// Turn the assets collected while rewriting into `AssetResult`s by resolving
// each one's capture status. The lookup is injected, so this module performs no
// network itself and stays easy to test. See design.md §3 step 6 and
// requirements R4.1, R4.2, R4.4, R8.6.

import { buildArchiveUrl } from '../core/archive-url.js';
import type { AssetKind, AssetResult, CaptureLookup } from '../core/types.js';
import type { CollectedAsset } from './rewrite-document.js';

/**
 * Default cap on how many distinct assets a single recovery checks against the
 * archive (R8.7). Kept small so a busy page cannot fire dozens of CDX requests;
 * assets past the cap are reported `unknown`, never recovered. With the page's
 * own CDX query and the snapshot, a typical page stays under six archive
 * requests.
 */
export const DEFAULT_MAX_CHECKED_ASSETS = 4;

/**
 * Lower checks first: render-shaping assets (stylesheets, scripts) and Flash
 * (needed for Ruffle) are worth a check before decorative images and media.
 */
const KIND_PRIORITY: Record<AssetKind, number> = {
  stylesheet: 0,
  script: 1,
  flash: 2,
  image: 3,
  media: 4,
  other: 5,
};

export interface ResolveAssetOptions {
  /**
   * Cap on the number of distinct assets checked against the archive. Assets
   * past the cap are reported `unknown` (R8.7). Omit to check every asset.
   */
  maxChecked?: number;
}

/**
 * Choose which unique asset URLs to check when a cap applies: ordered by kind
 * priority (lowest weight first), ties broken by first appearance for a stable
 * result, then sliced to `maxChecked`.
 */
function selectUrlsToCheck(
  assets: readonly CollectedAsset[],
  uniqueUrls: readonly string[],
  maxChecked: number,
): string[] {
  const bestWeight = new Map<string, number>();
  const firstIndex = new Map<string, number>();
  assets.forEach((asset, index) => {
    const weight = KIND_PRIORITY[asset.kind];
    const current = bestWeight.get(asset.originalUrl);
    if (current === undefined || weight < current) {
      bestWeight.set(asset.originalUrl, weight);
    }
    if (!firstIndex.has(asset.originalUrl)) {
      firstIndex.set(asset.originalUrl, index);
    }
  });

  return [...uniqueUrls]
    .sort((a, b) => {
      const byWeight =
        (bestWeight.get(a) ?? Number.MAX_SAFE_INTEGER) -
        (bestWeight.get(b) ?? Number.MAX_SAFE_INTEGER);
      if (byWeight !== 0) {
        return byWeight;
      }
      return (firstIndex.get(a) ?? 0) - (firstIndex.get(b) ?? 0);
    })
    .slice(0, Math.max(0, maxChecked));
}

/**
 * Resolve each collected asset to recovered / missing / unknown.
 *
 * - A capture with status 200 → `recovered`, with its archive URL (raw bytes).
 * - A capture with any other status, or no capture at all → `missing`.
 * - A URL the lookup could not determine, or one the cap left unchecked →
 *   `unknown` (never recovered, R4.4, R8.6).
 *
 * The lookup is called once with the (possibly capped) de-duplicated URL set,
 * so an implementation can batch its requests.
 */
export async function resolveAssetStatuses(
  assets: readonly CollectedAsset[],
  lookup: CaptureLookup,
  options: ResolveAssetOptions = {},
): Promise<AssetResult[]> {
  const urls = [...new Set(assets.map((asset) => asset.originalUrl))];
  const toCheck =
    options.maxChecked === undefined
      ? urls
      : selectUrlsToCheck(assets, urls, options.maxChecked);
  const found = await lookup(toCheck);

  return assets.map((asset) => {
    if (!found.has(asset.originalUrl)) {
      // Not checked (capped) or undetermined: honest "unknown", not missing.
      return {
        originalUrl: asset.originalUrl,
        kind: asset.kind,
        status: 'unknown',
      };
    }

    const capture = found.get(asset.originalUrl) ?? null;
    if (capture !== null && capture.statusCode === 200) {
      return {
        originalUrl: asset.originalUrl,
        kind: asset.kind,
        status: 'recovered',
        archiveUrl: buildArchiveUrl(asset.originalUrl, capture.timestamp, {
          raw: true,
        }),
      };
    }

    // No capture, or a capture that never returned 200 (R4.2).
    return {
      originalUrl: asset.originalUrl,
      kind: asset.kind,
      status: 'missing',
    };
  });
}
