import { describe, it, expect } from 'vitest';
import {
  rewriteSrcset,
  rewriteCssUrls,
  type RewriteContext,
} from '../../src/core/url-rewriter.js';

const TS = '20080303120000';
const PREFIX = `https://web.archive.org/web/${TS}id_/`;

const ctx: RewriteContext = {
  timestamp: TS,
  pageOriginalUrl: 'https://example.com/dir/page.html',
  raw: true,
};

describe('rewriteSrcset', () => {
  it('rewrites each candidate URL and keeps its descriptor', () => {
    const out = rewriteSrcset('img-320.jpg 320w, img-640.jpg 640w', ctx);
    expect(out).toBe(
      `${PREFIX}https://example.com/dir/img-320.jpg 320w,` +
        ` ${PREFIX}https://example.com/dir/img-640.jpg 640w`,
    );
  });

  it('handles a candidate with no descriptor', () => {
    const out = rewriteSrcset('plain.jpg', ctx);
    expect(out).toBe(`${PREFIX}https://example.com/dir/plain.jpg`);
  });

  it('handles pixel-density descriptors', () => {
    const out = rewriteSrcset('a.png 1x, b.png 2x', ctx);
    expect(out).toContain('a.png 1x');
    expect(out).toContain('b.png 2x');
    expect(out.startsWith(PREFIX)).toBe(true);
  });

  it('returns an empty value unchanged', () => {
    expect(rewriteSrcset('', ctx)).toBe('');
    expect(rewriteSrcset('   ', ctx)).toBe('   ');
  });
});

describe('rewriteCssUrls', () => {
  it('rewrites an unquoted url()', () => {
    expect(rewriteCssUrls('background: url(bg.png);', ctx)).toBe(
      `background: url(${PREFIX}https://example.com/dir/bg.png);`,
    );
  });

  it('keeps double quotes', () => {
    expect(rewriteCssUrls('background: url("bg.png");', ctx)).toBe(
      `background: url("${PREFIX}https://example.com/dir/bg.png");`,
    );
  });

  it('keeps single quotes', () => {
    expect(rewriteCssUrls("background: url('bg.png');", ctx)).toBe(
      `background: url('${PREFIX}https://example.com/dir/bg.png');`,
    );
  });

  it('rewrites multiple url() in one string', () => {
    const out = rewriteCssUrls(
      '@font-face{src:url(a.woff) format("woff"),url(b.woff2)}',
      ctx,
    );
    expect(out).toContain(`url(${PREFIX}https://example.com/dir/a.woff)`);
    expect(out).toContain(`url(${PREFIX}https://example.com/dir/b.woff2)`);
    expect(out).toContain('format("woff")');
  });

  it('leaves a data: URL in url() untouched', () => {
    const css = 'background: url(data:image/png;base64,AAAA);';
    expect(rewriteCssUrls(css, ctx)).toBe(css);
  });
});
