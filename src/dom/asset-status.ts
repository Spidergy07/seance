// Turn the assets collected while rewriting into `AssetResult`s by resolving
// each one's capture status. The lookup is injected, so this module performs no
// network itself and stays easy to test. See design.md §3 step 6 and
// requirements R4.1, R4.2, R4.4, R8.6.

import { buildArchiveUrl } from '../core/archive-url.js';
import type { AssetResult, CaptureLookup } from '../core/types.js';
import type { CollectedAsset } from './rewrite-document.js';

/**
 * Resolve each collected asset to recovered / missing / unknown.
 *
 * - A capture with status 200 → `recovered`, with its archive URL (raw bytes).
 * - A capture with any other status, or no capture at all → `missing`.
 * - A URL the lookup could not determine → `unknown` (never recovered, R4.4).
 *
 * The lookup is called once with the de-duplicated URL set, so an
 * implementation can batch its requests.
 */
export async function resolveAssetStatuses(
  assets: readonly CollectedAsset[],
  lookup: CaptureLookup,
): Promise<AssetResult[]> {
  const urls = [...new Set(assets.map((asset) => asset.originalUrl))];
  const found = await lookup(urls);

  return assets.map((asset) => {
    if (!found.has(asset.originalUrl)) {
      // The lookup could not determine a status: honest "unknown", not missing.
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
