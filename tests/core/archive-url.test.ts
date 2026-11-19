import { describe, it, expect } from 'vitest';
import {
  ARCHIVE_PREFIX,
  buildArchiveUrl,
  parseArchiveUrl,
  isArchiveUrl,
} from '../../src/core/archive-url.js';

const TS = '20080303120000';

describe('buildArchiveUrl', () => {
  it('builds the exact prefix shape without a modifier', () => {
    const url = buildArchiveUrl('http://example.com/page', TS);
    expect(url).toBe(`https://web.archive.org/web/${TS}/http://example.com/page`);
    expect(url.startsWith(`${ARCHIVE_PREFIX}${TS}/`)).toBe(true);
  });

  it('builds the raw prefix shape with the id_ modifier', () => {
    const url = buildArchiveUrl('http://example.com/a.js', TS, { raw: true });
    expect(url).toBe(
      `https://web.archive.org/web/${TS}id_/http://example.com/a.js`,
    );
    expect(url.startsWith(`${ARCHIVE_PREFIX}${TS}id_/`)).toBe(true);
  });

  it('appends query and fragment verbatim', () => {
    const original = 'https://example.com/p?x=1&y=2#frag';
    expect(buildArchiveUrl(original, TS)).toBe(
      `https://web.archive.org/web/${TS}/${original}`,
    );
  });

  it('rejects a timestamp that is not 14 digits', () => {
    expect(() => buildArchiveUrl('http://example.com', '2008')).toThrow();
    expect(() => buildArchiveUrl('http://example.com', '200803031200000')).toThrow();
    expect(() => buildArchiveUrl('http://example.com', 'notadate000000')).toThrow();
  });
});

describe('parseArchiveUrl', () => {
  it('returns null for a non-archive URL', () => {
    expect(parseArchiveUrl('https://example.com/page')).toBeNull();
    expect(parseArchiveUrl('mailto:someone@example.com')).toBeNull();
    expect(parseArchiveUrl('/relative/path')).toBeNull();
  });

  it('parses timestamp, raw flag, and original URL', () => {
    const parsed = parseArchiveUrl(
      `https://web.archive.org/web/${TS}id_/http://example.com/a.js`,
    );
    expect(parsed).toEqual({
      originalUrl: 'http://example.com/a.js',
      timestamp: TS,
      raw: true,
    });
  });

  it('treats a non-id_ modifier (e.g. im_) as not raw', () => {
    const parsed = parseArchiveUrl(
      `https://web.archive.org/web/${TS}im_/http://example.com/logo.png`,
    );
    expect(parsed).toEqual({
      originalUrl: 'http://example.com/logo.png',
      timestamp: TS,
      raw: false,
    });
  });

  it('parses an http (not https) archive URL', () => {
    const parsed = parseArchiveUrl(
      `http://web.archive.org/web/${TS}/http://example.com/`,
    );
    expect(parsed?.timestamp).toBe(TS);
    expect(parsed?.originalUrl).toBe('http://example.com/');
  });
});

describe('round-trip', () => {
  const originals = [
    'http://example.com/',
    'https://example.com/page',
    'https://example.com/p?x=1&y=2',
    'https://example.com/p?x=1#frag',
    'https://sub.example.co.uk/a/b/c.html#top',
  ];

  for (const original of originals) {
    it(`parse(build(${original})) recovers the parts (plain)`, () => {
      const built = buildArchiveUrl(original, TS);
      expect(parseArchiveUrl(built)).toEqual({
        originalUrl: original,
        timestamp: TS,
        raw: false,
      });
    });

    it(`parse(build(${original})) recovers the parts (raw)`, () => {
      const built = buildArchiveUrl(original, TS, { raw: true });
      expect(parseArchiveUrl(built)).toEqual({
        originalUrl: original,
        timestamp: TS,
        raw: true,
      });
    });
  }
});

describe('isArchiveUrl', () => {
  it('detects archive URLs', () => {
    expect(isArchiveUrl(`https://web.archive.org/web/${TS}/http://x.com`)).toBe(
      true,
    );
    expect(isArchiveUrl('https://example.com')).toBe(false);
  });
});
