// Task 45: zero-content tracking pixels (declared width and height both 0 or 1)
// must not count toward the recovery report. Their `src` is still rewritten to
// the archive for confinement, but they are excluded from the collected assets,
// so the certificate's count matches what the page shows once the render-time
// image guard hides them (R3.13). See requirements R4.7 and design.md §7.

import { describe, it, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { rewriteDocument } from '../../src/dom/rewrite-document.js';
import { ARCHIVE_PREFIX } from '../../src/core/archive-url.js';
import type { RewriteContext } from '../../src/core/url-rewriter.js';

const ctx: RewriteContext = {
  timestamp: '20001017124759',
  pageOriginalUrl: 'http://www.geocities.com/Athens/',
};

function parse(html: string): Document {
  return parseHTML(html).document as unknown as Document;
}

describe('tracking-pixel accounting (task 45, R4.7)', () => {
  it('excludes a 1x1 pixel from assets but still rewrites its src', () => {
    const doc = parse(
      '<html><body>' +
        '<img src="/photo.jpg">' +
        '<img src="http://visit.geocities.com/visit.gif" width="1" height="1">' +
        '</body></html>',
    );
    const { assets } = rewriteDocument(doc, ctx);

    // The real image is counted; the 1x1 pixel is not.
    const urls = assets.map((a) => a.originalUrl);
    expect(urls).toContain('http://www.geocities.com/photo.jpg');
    expect(urls).not.toContain('http://visit.geocities.com/visit.gif');
    expect(assets).toHaveLength(1);

    // The pixel's src is still confined to the archive (R3.4).
    const pixel = doc.querySelectorAll('img')[1];
    expect(pixel?.getAttribute('src')?.startsWith(ARCHIVE_PREFIX)).toBe(true);
  });

  it('excludes a 0x0 pixel too', () => {
    const doc = parse(
      '<html><body>' +
        '<img src="http://geo.yahoo.com/serv?s=76000424" width="0" height="0">' +
        '</body></html>',
    );
    const { assets } = rewriteDocument(doc, ctx);
    expect(assets).toHaveLength(0);
  });

  it('still counts an image that declares only one small dimension', () => {
    // A 1px-tall banner strip is not a zero-content web bug; only images whose
    // width AND height are both 0/1 are treated as tracking pixels.
    const doc = parse(
      '<html><body><img src="/bar.gif" width="400" height="1"></body></html>',
    );
    const { assets } = rewriteDocument(doc, ctx);
    expect(assets).toHaveLength(1);
  });
});
