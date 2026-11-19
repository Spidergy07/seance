import { describe, it, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import articleHtml from '../fixtures/html/article.html?raw';
import noArticleHtml from '../fixtures/html/no-article.html?raw';
import { extractReader, type ReaderDeps } from '../../src/dom/reader.js';
import { ARCHIVE_PREFIX } from '../../src/core/archive-url.js';
import type { RewriteContext } from '../../src/core/url-rewriter.js';

const ctx: RewriteContext = {
  timestamp: '20080303120000',
  pageOriginalUrl: 'http://oldsite.example/',
};

const deps: ReaderDeps = {
  parseHtml: (html) => parseHTML(html).document as unknown as Document,
};

describe('extractReader', () => {
  it('extracts the article title and body text', () => {
    const result = extractReader(articleHtml, ctx, deps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.title).toBe('The Lighthouse Keeper');
      expect(result.contentHtml).toContain('climbed the spiral stair');
    }
  });

  it('rewrites reader-view images to archive URLs (R7.4)', () => {
    const result = extractReader(articleHtml, ctx, deps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const doc = parseHTML(result.contentHtml).document as unknown as Document;
      const img = doc.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')?.startsWith(ARCHIVE_PREFIX)).toBe(true);
      expect(img?.getAttribute('src')).toContain('oldsite.example/img/figure.png');
    }
  });

  it('returns the no-article result when the page has no readable content', () => {
    const result = extractReader(noArticleHtml, ctx, deps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('no-article');
    }
  });

  it('returns the no-article result when the extractor yields null', () => {
    const stubbed: ReaderDeps = {
      ...deps,
      createReadability: () => ({ parse: () => null }),
    };
    const result = extractReader(articleHtml, ctx, stubbed);
    expect(result.ok).toBe(false);
  });
});
