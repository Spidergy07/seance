import { describe, it, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import sampleHtml from '../fixtures/html/sample.html?raw';
import { rewriteDocument } from '../../src/dom/rewrite-document.js';
import { ARCHIVE_PREFIX } from '../../src/core/archive-url.js';
import type { RewriteContext } from '../../src/core/url-rewriter.js';

const ctx: RewriteContext = {
  timestamp: '20080303120000',
  pageOriginalUrl: 'http://oldsite.example/',
};

function parse(html: string): Document {
  return parseHTML(html).document as unknown as Document;
}

// A value is confined if it is an archive URL or a reference the rewriter must
// leave alone (pure fragment or non-resolvable scheme).
function isConfined(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('mailto:')) {
    return true;
  }
  return trimmed.startsWith(ARCHIVE_PREFIX);
}

describe('rewriteDocument', () => {
  it('removes <base> so it cannot redirect resolution off the archive', () => {
    const doc = parse(sampleHtml);
    rewriteDocument(doc, ctx);
    expect(doc.querySelector('base')).toBeNull();
  });

  it('rewrites every element URL to the archive, including external links', () => {
    const doc = parse(sampleHtml);
    rewriteDocument(doc, ctx);

    const stylesheet = doc.querySelector('link[rel="stylesheet"]');
    expect(stylesheet?.getAttribute('href')?.startsWith(ARCHIVE_PREFIX)).toBe(true);

    const logo = doc.querySelector('img[alt="logo"]');
    expect(logo?.getAttribute('src')?.startsWith(ARCHIVE_PREFIX)).toBe(true);

    // External link is confined to the archive too (R3.4): no live-web escape.
    const external = Array.from(doc.querySelectorAll('a')).find((a) =>
      (a.getAttribute('href') ?? '').includes('other.example'),
    );
    expect(external?.getAttribute('href')?.startsWith(ARCHIVE_PREFIX)).toBe(true);

    const script = doc.querySelector('script[src]');
    expect(script?.getAttribute('src')?.startsWith(ARCHIVE_PREFIX)).toBe(true);
  });

  it('preserves an in-page anchor fragment and leaves mailto untouched', () => {
    const doc = parse(sampleHtml);
    rewriteDocument(doc, ctx);
    const anchors = Array.from(doc.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    );
    expect(anchors).toContain('#section');
    expect(anchors).toContain('mailto:hi@oldsite.example');
  });

  it('rewrites both srcset candidates and keeps their descriptors', () => {
    const doc = parse(sampleHtml);
    rewriteDocument(doc, ctx);
    const responsive = doc.querySelector('img[srcset]');
    const srcset = responsive?.getAttribute('srcset') ?? '';
    const candidates = srcset.split(',').map((c) => c.trim());
    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.startsWith(ARCHIVE_PREFIX)).toBe(true);
    expect(candidates[0]?.endsWith(' 1x')).toBe(true);
    expect(candidates[1]?.endsWith(' 2x')).toBe(true);
  });

  it('rewrites url() in <style> and inline style attributes', () => {
    const doc = parse(sampleHtml);
    rewriteDocument(doc, ctx);
    const styleText = doc.querySelector('style')?.textContent ?? '';
    expect(styleText).toContain(`url("${ARCHIVE_PREFIX}`);
    const panel = doc.querySelector('div[style]');
    expect(panel?.getAttribute('style')).toContain(`url('${ARCHIVE_PREFIX}`);
  });

  it('confinement: no element references a host other than web.archive.org', () => {
    const doc = parse(sampleHtml);
    rewriteDocument(doc, ctx);
    const attrs = ['href', 'src', 'poster', 'data'];
    for (const el of Array.from(doc.querySelectorAll('*'))) {
      for (const attr of attrs) {
        const value = el.getAttribute(attr);
        if (value !== null) {
          expect(isConfined(value)).toBe(true);
        }
      }
      const srcset = el.getAttribute('srcset');
      if (srcset !== null) {
        for (const candidate of srcset.split(',')) {
          const url = candidate.trim().split(/\s/)[0] ?? '';
          expect(isConfined(url)).toBe(true);
        }
      }
    }
  });
});

describe('rewriteDocument — asset collection', () => {
  it('collects element-level assets with the expected kinds', () => {
    const doc = parse(sampleHtml);
    const { assets } = rewriteDocument(doc, ctx);

    const byKind = new Map<string, number>();
    for (const asset of assets) {
      byKind.set(asset.kind, (byKind.get(asset.kind) ?? 0) + 1);
    }

    // 13 unique assets: links are not assets; style url() images are not
    // enumerated; small.png is de-duplicated across img[src] and img[srcset].
    expect(assets).toHaveLength(13);
    expect(byKind.get('stylesheet')).toBe(1);
    expect(byKind.get('script')).toBe(1);
    expect(byKind.get('flash')).toBe(2);
    expect(byKind.get('media')).toBe(2);
    expect(byKind.get('other')).toBe(1); // the iframe
    expect(byKind.get('image')).toBe(6);

    const urls = assets.map((a) => a.originalUrl);
    expect(urls).toContain('http://oldsite.example/flash/intro.swf');
    expect(urls).toContain('http://oldsite.example/js/app.js');
    // Navigation links are never counted as assets.
    expect(urls.some((u) => u.endsWith('/about.html'))).toBe(false);
  });
});
