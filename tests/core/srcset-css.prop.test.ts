import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  rewriteSrcset,
  rewriteCssUrls,
  type RewriteContext,
} from '../../src/core/url-rewriter.js';

// Property tests for task 7: descriptor shape (srcset) and quote shape (CSS)
// must survive rewriting, and every rewritten URL must be an archive URL.

const RUNS = 500;
const TS = '20080303120000';
const PREFIX = `https://web.archive.org/web/${TS}id_/`;
const ctx: RewriteContext = {
  timestamp: TS,
  pageOriginalUrl: 'https://example.com/dir/page.html',
  raw: true,
};

const SEG_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('');
const segmentArb = fc
  .array(fc.constantFrom(...SEG_CHARS), { minLength: 1, maxLength: 8 })
  .map((chars) => chars.join(''));
const fileArb = fc.tuple(segmentArb, fc.constantFrom('jpg', 'png', 'webp')).map(
  ([name, ext]) => `${name}.${ext}`,
);
const descriptorArb = fc.oneof(
  fc.constant(''),
  fc.integer({ min: 1, max: 5 }).map((n) => `${n}x`),
  fc.integer({ min: 100, max: 2000 }).map((n) => `${n}w`),
);

describe('rewriteSrcset — descriptor shape preserved', () => {
  it('keeps every descriptor and archives every candidate URL', () => {
    const candidatesArb = fc.array(
      fc.record({ file: fileArb, descriptor: descriptorArb }),
      { minLength: 1, maxLength: 5 },
    );
    fc.assert(
      fc.property(candidatesArb, (candidates) => {
        const srcset = candidates
          .map((c) => (c.descriptor ? `${c.file} ${c.descriptor}` : c.file))
          .join(', ');
        const out = rewriteSrcset(srcset, ctx);

        // One comma fewer than candidates.
        expect((out.match(/,/g) ?? []).length).toBe(candidates.length - 1);
        // Each descriptor survives and each URL is archived.
        for (const c of candidates) {
          if (c.descriptor) {
            expect(out).toContain(` ${c.descriptor}`);
          }
          expect(out).toContain(`${PREFIX}https://example.com/dir/${c.file}`);
        }
      }),
      { numRuns: RUNS },
    );
  });
});

describe('rewriteCssUrls — quote shape preserved', () => {
  it('keeps the quoting style and archives the URL', () => {
    fc.assert(
      fc.property(fileArb, fc.constantFrom('', '"', "'"), (file, quote) => {
        const css = `url(${quote}${file}${quote})`;
        const out = rewriteCssUrls(css, ctx);
        expect(out.startsWith(`url(${quote}`)).toBe(true);
        expect(out.endsWith(`${quote})`)).toBe(true);
        expect(out).toContain(`${PREFIX}https://example.com/dir/${file}`);
      }),
      { numRuns: RUNS },
    );
  });
});
