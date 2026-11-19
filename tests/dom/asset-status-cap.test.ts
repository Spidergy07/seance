// Task 32 (R8.7): the asset-check cap. `resolveAssetStatuses` checks at most
// `maxChecked` distinct assets, chosen by kind priority (stylesheet, script,
// Flash, then image, media, other), and marks every asset it did not check
// "unknown" so an unchecked asset is never counted as recovered (R4.4, R8.6).

import { describe, it, expect } from 'vitest';
import { resolveAssetStatuses } from '../../src/dom/asset-status.js';
import type { Capture, CaptureLookup } from '../../src/core/types.js';
import type { CollectedAsset } from '../../src/dom/rewrite-document.js';

function capture(originalUrl: string): Capture {
  return { originalUrl, timestamp: '20080303120000', statusCode: 200, mimeType: '' };
}

/** A lookup that records which URLs it was asked about and answers 200 for all. */
function recordingLookup(): { lookup: CaptureLookup; asked: string[] } {
  const asked: string[] = [];
  const lookup: CaptureLookup = async (urls) => {
    const out = new Map<string, Capture | null>();
    for (const url of urls) {
      asked.push(url);
      out.set(url, capture(url));
    }
    return out;
  };
  return { lookup, asked };
}

const MIXED: CollectedAsset[] = [
  { originalUrl: 'http://s/a.png', kind: 'image' },
  { originalUrl: 'http://s/b.mp4', kind: 'media' },
  { originalUrl: 'http://s/c.css', kind: 'stylesheet' },
  { originalUrl: 'http://s/d.js', kind: 'script' },
  { originalUrl: 'http://s/e.swf', kind: 'flash' },
  { originalUrl: 'http://s/f.html', kind: 'other' },
];

describe('resolveAssetStatuses with a check cap', () => {
  it('checks only the highest-priority assets up to the cap', async () => {
    const { lookup, asked } = recordingLookup();
    await resolveAssetStatuses(MIXED, lookup, { maxChecked: 3 });

    // Priority order is stylesheet, script, flash — so those three are checked.
    expect(new Set(asked)).toEqual(
      new Set(['http://s/c.css', 'http://s/d.js', 'http://s/e.swf']),
    );
    expect(asked).toHaveLength(3);
  });

  it('marks assets past the cap as unknown, never recovered', async () => {
    const { lookup } = recordingLookup();
    const results = await resolveAssetStatuses(MIXED, lookup, { maxChecked: 3 });
    const byUrl = new Map(results.map((r) => [r.originalUrl, r]));

    expect(byUrl.get('http://s/c.css')?.status).toBe('recovered');
    expect(byUrl.get('http://s/d.js')?.status).toBe('recovered');
    expect(byUrl.get('http://s/e.swf')?.status).toBe('recovered');
    // The image, media, and "other" assets were never checked → unknown.
    expect(byUrl.get('http://s/a.png')?.status).toBe('unknown');
    expect(byUrl.get('http://s/b.mp4')?.status).toBe('unknown');
    expect(byUrl.get('http://s/f.html')?.status).toBe('unknown');
    // An unknown asset carries no archive URL.
    expect(byUrl.get('http://s/a.png')?.archiveUrl).toBeUndefined();
  });

  it('checks every asset when no cap is given', async () => {
    const { lookup, asked } = recordingLookup();
    await resolveAssetStatuses(MIXED, lookup);
    expect(asked).toHaveLength(MIXED.length);
  });
});
