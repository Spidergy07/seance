import { describe, it, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import sampleHtml from '../fixtures/html/sample.html?raw';
import { rewriteDocument } from '../../src/dom/rewrite-document.js';
import { resolveAssetStatuses } from '../../src/dom/asset-status.js';
import { ARCHIVE_PREFIX } from '../../src/core/archive-url.js';
import type { Capture, CaptureLookup } from '../../src/core/types.js';
import type { CollectedAsset } from '../../src/dom/rewrite-document.js';
import type { RewriteContext } from '../../src/core/url-rewriter.js';

const ctx: RewriteContext = {
  timestamp: '20080303120000',
  pageOriginalUrl: 'http://oldsite.example/',
};

function capture(originalUrl: string, statusCode: number): Capture {
  return { originalUrl, timestamp: '20080303120000', statusCode, mimeType: '' };
}

/** A lookup backed by a fixed map; absent keys stay undetermined (unknown). */
function lookupFrom(map: Map<string, Capture | null>): CaptureLookup {
  return async (urls) => {
    const out = new Map<string, Capture | null>();
    for (const url of urls) {
      if (map.has(url)) {
        out.set(url, map.get(url) ?? null);
      }
    }
    return out;
  };
}

describe('resolveAssetStatuses', () => {
  it('covers recovered, missing (no capture), missing (non-200), and unknown', async () => {
    const assets: CollectedAsset[] = [
      { originalUrl: 'http://oldsite.example/js/app.js', kind: 'script' },
      { originalUrl: 'http://oldsite.example/img/gone.png', kind: 'image' },
      { originalUrl: 'http://oldsite.example/flash/intro.swf', kind: 'flash' },
      { originalUrl: 'http://oldsite.example/media/clip.mp4', kind: 'media' },
    ];
    const lookup = lookupFrom(
      new Map<string, Capture | null>([
        ['http://oldsite.example/js/app.js', capture('http://oldsite.example/js/app.js', 200)],
        ['http://oldsite.example/img/gone.png', null],
        ['http://oldsite.example/flash/intro.swf', capture('http://oldsite.example/flash/intro.swf', 404)],
        // media/clip.mp4 is omitted → unknown
      ]),
    );

    const results = await resolveAssetStatuses(assets, lookup);
    const byUrl = new Map(results.map((r) => [r.originalUrl, r]));

    const recovered = byUrl.get('http://oldsite.example/js/app.js');
    expect(recovered?.status).toBe('recovered');
    expect(recovered?.archiveUrl?.startsWith(ARCHIVE_PREFIX)).toBe(true);

    expect(byUrl.get('http://oldsite.example/img/gone.png')?.status).toBe('missing');
    expect(byUrl.get('http://oldsite.example/flash/intro.swf')?.status).toBe('missing');
    expect(byUrl.get('http://oldsite.example/media/clip.mp4')?.status).toBe('unknown');

    // A missing/unknown asset never carries an archive URL.
    expect(byUrl.get('http://oldsite.example/img/gone.png')?.archiveUrl).toBeUndefined();
    expect(byUrl.get('http://oldsite.example/media/clip.mp4')?.archiveUrl).toBeUndefined();
  });

  it('resolves the statuses of a fixture page with mixed availability', async () => {
    const doc = parseHTML(sampleHtml).document as unknown as Document;
    const { assets } = rewriteDocument(doc, ctx);

    // Everything is a working 200 except the two Flash files: one missing, one
    // undetermined (left out of the map → unknown).
    const map = new Map<string, Capture | null>();
    for (const asset of assets) {
      if (asset.originalUrl.endsWith('intro.swf')) {
        map.set(asset.originalUrl, null); // missing
      } else if (asset.originalUrl.endsWith('banner.swf')) {
        // omit → unknown
      } else {
        map.set(asset.originalUrl, capture(asset.originalUrl, 200));
      }
    }

    const results = await resolveAssetStatuses(assets, lookupFrom(map));
    const counts = { recovered: 0, missing: 0, unknown: 0 };
    for (const r of results) {
      counts[r.status] += 1;
    }
    expect(counts.recovered).toBe(11);
    expect(counts.missing).toBe(1);
    expect(counts.unknown).toBe(1);
  });

  it('reports a redirect-only (3xx) capture as not recovered (R4.6)', async () => {
    const assets: CollectedAsset[] = [
      { originalUrl: 'http://oldsite.example/pixel.gif', kind: 'image' },
      { originalUrl: 'http://oldsite.example/moved.css', kind: 'stylesheet' },
    ];
    const lookup = lookupFrom(
      new Map<string, Capture | null>([
        // The archive only ever answered these with a redirect.
        ['http://oldsite.example/pixel.gif', capture('http://oldsite.example/pixel.gif', 302)],
        ['http://oldsite.example/moved.css', capture('http://oldsite.example/moved.css', 301)],
      ]),
    );

    const results = await resolveAssetStatuses(assets, lookup);
    for (const result of results) {
      expect(result.status).toBe('missing');
      expect(result.archiveUrl).toBeUndefined();
    }
  });
});
