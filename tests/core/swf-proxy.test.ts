// Task 35: the pure builder/parser for the same-origin `.swf` CORS proxy URL.
// Ruffle in the opaque-origin iframe cannot fetch the raw archive `.swf`
// directly (no CORS headers), so its URL is wrapped to point at our own
// endpoint. The target stays an archive URL, so confinement (R3.4) holds.

import { describe, it, expect } from 'vitest';
import {
  SWF_PROXY_PATH,
  buildSwfProxyUrl,
  parseSwfProxyUrl,
  isSwfProxyUrl,
} from '../../src/core/swf-proxy.js';
import { buildArchiveUrl } from '../../src/core/archive-url.js';

const archive = buildArchiveUrl(
  'http://www.homestarrunner.com/welcome.swf',
  '20051231232721',
  { raw: true },
);

describe('buildSwfProxyUrl', () => {
  it('wraps an archive URL as an absolute app-origin proxy URL', () => {
    const proxy = buildSwfProxyUrl(archive, 'https://app.example/api/swf');
    expect(proxy.startsWith('https://app.example/api/swf?')).toBe(true);
    // The archive URL is carried verbatim in the url parameter.
    expect(new URL(proxy).searchParams.get('url')).toBe(archive);
  });

  it('is absolute even when given an origin without the path', () => {
    const proxy = buildSwfProxyUrl(archive, `https://app.example${SWF_PROXY_PATH}`);
    expect(proxy.startsWith('https://app.example/api/swf?')).toBe(true);
  });
});

describe('parseSwfProxyUrl / isSwfProxyUrl', () => {
  it('round-trips the archive URL back out of the proxy URL', () => {
    const proxy = buildSwfProxyUrl(archive, 'https://app.example/api/swf');
    expect(parseSwfProxyUrl(proxy)).toBe(archive);
    expect(isSwfProxyUrl(proxy)).toBe(true);
  });

  it('rejects a proxy URL whose target is not an archive URL (no open proxy)', () => {
    const bad = buildSwfProxyUrl('https://evil.example/x.swf', 'https://app.example/api/swf');
    expect(parseSwfProxyUrl(bad)).toBeNull();
    expect(isSwfProxyUrl(bad)).toBe(false);
  });

  it('returns null for non-proxy URLs', () => {
    expect(parseSwfProxyUrl(archive)).toBeNull();
    expect(parseSwfProxyUrl('not a url')).toBeNull();
    expect(isSwfProxyUrl('https://app.example/other?url=' + encodeURIComponent(archive))).toBe(false);
  });
});
