import { describe, it, expect } from 'vitest';
import { rewrite, type RewriteContext } from '../../src/core/url-rewriter.js';

const TS = '20080303120000';
const PREFIX = `https://web.archive.org/web/${TS}id_/`;

const ctx: RewriteContext = {
  timestamp: TS,
  pageOriginalUrl: 'https://example.com/dir/page.html',
  raw: true,
};

describe('rewrite — resolvable references', () => {
  it('rewrites an absolute URL', () => {
    expect(rewrite('https://other.com/x.png', ctx)).toBe(
      `${PREFIX}https://other.com/x.png`,
    );
  });

  it('resolves a relative path against the page URL', () => {
    expect(rewrite('images/p.jpg', ctx)).toBe(
      `${PREFIX}https://example.com/dir/images/p.jpg`,
    );
  });

  it('resolves a root-relative path against the origin', () => {
    expect(rewrite('/style.css', ctx)).toBe(
      `${PREFIX}https://example.com/style.css`,
    );
  });

  it('resolves a protocol-relative URL using the page scheme', () => {
    expect(rewrite('//cdn.example.net/a.js', ctx)).toBe(
      `${PREFIX}https://cdn.example.net/a.js`,
    );
  });

  it('preserves query and fragment', () => {
    const out = rewrite('/p?x=1&y=2#frag', ctx);
    expect(out).toBe(`${PREFIX}https://example.com/p?x=1&y=2#frag`);
    expect(out).toContain('?x=1&y=2');
    expect(out.endsWith('#frag')).toBe(true);
  });
});

describe('rewrite — pass-through references', () => {
  it('returns an empty reference unchanged', () => {
    expect(rewrite('', ctx)).toBe('');
    expect(rewrite('   ', ctx)).toBe('   ');
  });

  it('returns a pure fragment unchanged', () => {
    expect(rewrite('#top', ctx)).toBe('#top');
  });

  it.each(['mailto:a@b.com', 'tel:+15551234', 'javascript:void(0)', 'data:text/plain,hi', 'about:blank', 'blob:abc'])(
    'returns non-resolvable scheme %s unchanged',
    (ref) => {
      expect(rewrite(ref, ctx)).toBe(ref);
    },
  );

  it('ignores scheme case when detecting pass-through', () => {
    expect(rewrite('MAILTO:a@b.com', ctx)).toBe('MAILTO:a@b.com');
    expect(rewrite('JavaScript:void(0)', ctx)).toBe('JavaScript:void(0)');
  });
});

describe('rewrite — already-archived input', () => {
  it('rewrites from the embedded original and re-points the timestamp', () => {
    const archived = 'https://web.archive.org/web/19990101000000/http://old.example.com/home';
    expect(rewrite(archived, ctx)).toBe(
      `${PREFIX}http://old.example.com/home`,
    );
  });

  it('is idempotent: rewriting twice equals rewriting once', () => {
    const inputs = [
      'https://other.com/x.png',
      'images/p.jpg',
      '/style.css',
      '//cdn.example.net/a.js',
      '/p?x=1#frag',
      'https://web.archive.org/web/19990101000000/http://old.example.com/',
    ];
    for (const input of inputs) {
      const once = rewrite(input, ctx);
      expect(rewrite(once, ctx)).toBe(once);
    }
  });
});

describe('rewrite — raw flag', () => {
  it('omits the id_ modifier when raw is false', () => {
    const plainCtx: RewriteContext = { ...ctx, raw: false };
    expect(rewrite('https://other.com/x.png', plainCtx)).toBe(
      `https://web.archive.org/web/${TS}/https://other.com/x.png`,
    );
  });

  it('defaults to raw (id_) when raw is omitted', () => {
    const noRawCtx: RewriteContext = {
      timestamp: TS,
      pageOriginalUrl: 'https://example.com/dir/page.html',
    };
    expect(rewrite('https://other.com/x.png', noRawCtx)).toBe(
      `${PREFIX}https://other.com/x.png`,
    );
  });
});
