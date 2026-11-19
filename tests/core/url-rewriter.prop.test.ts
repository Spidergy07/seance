import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { rewrite, type RewriteContext } from '../../src/core/url-rewriter.js';
import { ARCHIVE_PREFIX, parseArchiveUrl } from '../../src/core/archive-url.js';

// Property tests for the rewriter invariants in design.md §4.3 (I1–I6).
// fast-check generates random URLs, paths, queries, and fragments to try to
// break the invariants. Tests are offline and deterministic.

const RUNS = 1000;

const SEG_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('');

/** A 14-digit Wayback timestamp. */
const timestampArb = fc
  .array(fc.integer({ min: 0, max: 9 }), { minLength: 14, maxLength: 14 })
  .map((digits) => digits.join(''));

/** An absolute http(s) base page URL to resolve relatives against. */
const baseUrlArb = fc.webUrl();

const ctxArb: fc.Arbitrary<RewriteContext> = fc.record({
  timestamp: timestampArb,
  pageOriginalUrl: baseUrlArb,
  raw: fc.boolean(),
});

/** One path segment of safe characters (never re-encoded by the URL API). */
const segmentArb = fc
  .array(fc.constantFrom(...SEG_CHARS), { minLength: 1, maxLength: 8 })
  .map((chars) => chars.join(''));

const pathArb = fc
  .array(segmentArb, { minLength: 1, maxLength: 4 })
  .map((segs) => segs.join('/'));

/** A resolvable reference: absolute, relative, root-relative, or protocol-relative. */
const resolvableRefArb = fc.oneof(
  fc.webUrl(),
  pathArb, // relative
  pathArb.map((p) => `/${p}`), // root-relative
  fc.tuple(fc.domain(), pathArb).map(([host, p]) => `//${host}/${p}`), // protocol-relative
);

const NON_RESOLVABLE = ['mailto', 'tel', 'javascript', 'data', 'blob', 'about'];

const nonResolvableRefArb = fc
  .tuple(fc.constantFrom(...NON_RESOLVABLE), fc.string())
  .map(([scheme, rest]) => `${scheme}:${rest}`);

/** An already-archived URL, for the idempotence check. */
const archiveRefArb = fc
  .tuple(timestampArb, fc.webUrl())
  .map(([ts, url]) => `https://web.archive.org/web/${ts}/${url}`);

describe('I2 confinement — resolvable inputs never escape the archive', () => {
  it('output starts with the archive prefix and its host is web.archive.org', () => {
    fc.assert(
      fc.property(resolvableRefArb, ctxArb, (ref, ctx) => {
        const out = rewrite(ref, ctx);
        expect(out.startsWith(ARCHIVE_PREFIX)).toBe(true);
        expect(new URL(out).host).toBe('web.archive.org');
      }),
      { numRuns: RUNS },
    );
  });
});

describe('I6 timestamp fidelity — embedded timestamp equals ctx.timestamp', () => {
  it('parses back the context timestamp', () => {
    fc.assert(
      fc.property(resolvableRefArb, ctxArb, (ref, ctx) => {
        const out = rewrite(ref, ctx);
        expect(parseArchiveUrl(out)?.timestamp).toBe(ctx.timestamp);
      }),
      { numRuns: RUNS },
    );
  });
});

describe('I1 idempotence — rewriting twice equals rewriting once', () => {
  const anyRefArb = fc.oneof(
    resolvableRefArb,
    nonResolvableRefArb,
    archiveRefArb,
    fc.string(),
    fc.constantFrom('', '   ', '#frag', '#'),
  );

  it('holds for arbitrary references', () => {
    fc.assert(
      fc.property(anyRefArb, ctxArb, (ref, ctx) => {
        const once = rewrite(ref, ctx);
        expect(rewrite(once, ctx)).toBe(once);
      }),
      { numRuns: RUNS },
    );
  });
});

describe('I3 + I4 fragment and query preservation', () => {
  const partsArb = fc.record({
    path: pathArb,
    query: fc.array(fc.tuple(segmentArb, segmentArb), { maxLength: 3 }),
    frag: fc.option(segmentArb, { nil: '' }),
  });

  it('keeps the query string and trailing fragment for resolvable inputs', () => {
    fc.assert(
      fc.property(partsArb, ctxArb, ({ path, query, frag }, ctx) => {
        const queryStr =
          query.length > 0
            ? '?' + query.map(([k, v]) => `${k}=${v}`).join('&')
            : '';
        const fragStr = frag ? `#${frag}` : '';
        const ref = `/${path}${queryStr}${fragStr}`;
        const out = rewrite(ref, ctx);

        if (queryStr !== '') {
          expect(out).toContain(queryStr);
        }
        if (fragStr !== '') {
          expect(out.endsWith(fragStr)).toBe(true);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('returns pure fragments unchanged', () => {
    fc.assert(
      fc.property(segmentArb, ctxArb, (frag, ctx) => {
        const ref = `#${frag}`;
        expect(rewrite(ref, ctx)).toBe(ref);
      }),
      { numRuns: RUNS },
    );
  });
});

describe('I5 passthrough — non-resolvable schemes are returned unchanged', () => {
  it('leaves mailto/tel/javascript/data/blob/about untouched', () => {
    fc.assert(
      fc.property(nonResolvableRefArb, ctxArb, (ref, ctx) => {
        expect(rewrite(ref, ctx)).toBe(ref);
      }),
      { numRuns: RUNS },
    );
  });
});
