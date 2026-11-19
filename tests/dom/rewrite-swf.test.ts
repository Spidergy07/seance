// Task 35: route recovered `.swf` embeds through the same-origin CORS proxy so
// Ruffle (running in the opaque-origin iframe) can fetch the bytes. This step
// runs after the document rewrite (so `.swf` values are already archive URLs)
// and after applyFlashNotices. It wraps object[data], embed[src], and
// param[name=movie|src] whose value is an archive `.swf`.

import { describe, it, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { rewriteDocument } from '../../src/dom/rewrite-document.js';
import { rewriteSwfToProxy } from '../../src/dom/rewrite-swf.js';
import { parseSwfProxyUrl, isSwfProxyUrl } from '../../src/core/swf-proxy.js';
import type { RewriteContext } from '../../src/core/url-rewriter.js';

const ctx: RewriteContext = {
  timestamp: '20051231232721',
  pageOriginalUrl: 'http://www.homestarrunner.com/',
};

const PROXY = 'https://app.example/api/swf';

function parse(html: string): Document {
  return parseHTML(html).document as unknown as Document;
}

describe('rewriteSwfToProxy', () => {
  it('rewrites object/embed/param .swf to the proxy, target stays an archive URL', () => {
    const doc = parse(
      '<html><body>' +
        '<object data="welcome.swf">' +
        '<param name="movie" value="welcome.swf">' +
        '<param name="quality" value="high">' +
        '</object>' +
        '<embed src="main_nav.swf">' +
        '</body></html>',
    );
    rewriteDocument(doc, ctx); // confines .swf to archive, incl. param movie
    const count = rewriteSwfToProxy(doc, PROXY);
    expect(count).toBe(3); // object data + param movie + embed src

    const objectData = doc.querySelector('object')?.getAttribute('data') ?? '';
    expect(isSwfProxyUrl(objectData)).toBe(true);
    expect(parseSwfProxyUrl(objectData)).toContain('web.archive.org');
    expect(parseSwfProxyUrl(objectData)).toContain('welcome.swf');

    const movie = Array.from(doc.querySelectorAll('param')).find(
      (p) => (p.getAttribute('name') ?? '').toLowerCase() === 'movie',
    );
    expect(isSwfProxyUrl(movie?.getAttribute('value') ?? '')).toBe(true);

    // A non-URL param is untouched.
    const quality = Array.from(doc.querySelectorAll('param')).find(
      (p) => (p.getAttribute('name') ?? '').toLowerCase() === 'quality',
    );
    expect(quality?.getAttribute('value')).toBe('high');

    const embed = doc.querySelector('embed')?.getAttribute('src') ?? '';
    expect(isSwfProxyUrl(embed)).toBe(true);
  });

  it('leaves non-swf object data alone', () => {
    const doc = parse('<html><body><object data="movie.mp4"></object></body></html>');
    rewriteDocument(doc, ctx);
    const count = rewriteSwfToProxy(doc, PROXY);
    expect(count).toBe(0);
    expect(isSwfProxyUrl(doc.querySelector('object')?.getAttribute('data') ?? '')).toBe(false);
  });
});

describe('rewriteDocument — Flash param confinement', () => {
  it('rewrites param[name=movie] value to the archive (R3.4)', () => {
    const doc = parse(
      '<html><body><object><param name="movie" value="flash/x.swf"></object></body></html>',
    );
    rewriteDocument(doc, ctx);
    const movie = doc.querySelector('param');
    expect(movie?.getAttribute('value')?.startsWith('https://web.archive.org/web/')).toBe(true);
  });
});
