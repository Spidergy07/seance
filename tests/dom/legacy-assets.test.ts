// Task 28: honest asset accounting. Old pages (GeoCities and the like) put
// images in legacy presentational attributes — `background` on body/table
// cells and `<input type=image src>`. These were neither rewritten nor counted,
// so a genuinely missing background image showed broken while the certificate
// still read 100%. These offline tests assert those images are rewritten,
// collected, and reported by their real capture status.

import { describe, it, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import legacyHtml from '../fixtures/html/legacy-assets.html?raw';
import { rewriteDocument } from '../../src/dom/rewrite-document.js';
import { resolveAssetStatuses } from '../../src/dom/asset-status.js';
import { buildRecoveryReport } from '../../src/core/recovery.js';
import { ARCHIVE_PREFIX } from '../../src/core/archive-url.js';
import type { Capture, CaptureLookup } from '../../src/core/types.js';
import type { RewriteContext } from '../../src/core/url-rewriter.js';

const ctx: RewriteContext = {
  timestamp: '20001017124759',
  pageOriginalUrl: 'http://www.geocities.com/Athens/',
};

function parse(html: string): Document {
  return parseHTML(html).document as unknown as Document;
}

function capture(originalUrl: string, statusCode: number): Capture {
  return { originalUrl, timestamp: '20001017124759', statusCode, mimeType: '' };
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

describe('legacy image attributes (task 28)', () => {
  it('rewrites background and image-input attributes to the archive', () => {
    const doc = parse(legacyHtml);
    rewriteDocument(doc, ctx);

    const withBackground = Array.from(doc.querySelectorAll('[background]'));
    expect(withBackground.length).toBe(3);
    for (const el of withBackground) {
      expect(el.getAttribute('background')?.startsWith(ARCHIVE_PREFIX)).toBe(true);
    }

    const input = doc.querySelector('input[src]');
    expect(input?.getAttribute('src')?.startsWith(ARCHIVE_PREFIX)).toBe(true);
  });

  it('collects every referenced image, including legacy attributes', () => {
    const doc = parse(legacyHtml);
    const { assets } = rewriteDocument(doc, ctx);
    const urls = assets.map((a) => a.originalUrl);

    expect(urls).toContain('http://www.geocities.com/images/stars_bg.gif');
    expect(urls).toContain('http://www.geocities.com/images/table_bg.gif');
    expect(urls).toContain('http://www.geocities.com/images/cell_bg.gif');
    expect(urls).toContain('http://www.geocities.com/images/welcome.gif');
    expect(urls).toContain('http://www.geocities.com/images/submit.gif');
    // All five are images.
    expect(assets.every((a) => a.kind === 'image')).toBe(true);
  });

  it('reports a background image with no capture as missing, not recovered', async () => {
    const doc = parse(legacyHtml);
    const { assets } = rewriteDocument(doc, ctx);

    // Only welcome.gif has a working capture; the four others have none.
    const map = new Map<string, Capture | null>();
    for (const asset of assets) {
      map.set(
        asset.originalUrl,
        asset.originalUrl.endsWith('/welcome.gif')
          ? capture(asset.originalUrl, 200)
          : null,
      );
    }

    const results = await resolveAssetStatuses(assets, lookupFrom(map));
    const report = buildRecoveryReport({
      selectedCapture: capture(ctx.pageOriginalUrl, 200),
      lastWorkingCapture: capture(ctx.pageOriginalUrl, 200),
      assets: results,
    });

    // One recovered of five → 20%, not a dishonest 100%.
    expect(report.totalCount).toBe(5);
    expect(report.recoveredCount).toBe(1);
    expect(report.recoveryPercent).toBe(20);

    const statusOf = (suffix: string) =>
      results.find((r) => r.originalUrl.endsWith(suffix))?.status;
    expect(statusOf('/stars_bg.gif')).toBe('missing');
    expect(statusOf('/welcome.gif')).toBe('recovered');
  });
});
