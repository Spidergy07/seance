// Task 32 (R8.8): the session CDX cache. `fetchCaptures` consults an injected
// cache so a repeated lookup of the same URL makes no new archive request, and
// a failed lookup is never cached (so a transient error can still be retried).

import { describe, it, expect } from 'vitest';
import { fetchCaptures } from '../../src/archive/cdx-client.js';
import { createCdxCache } from '../../src/archive/cdx-cache.js';

function header() {
  return ['urlkey', 'timestamp', 'original', 'mimetype', 'statuscode', 'digest', 'length'];
}

function okRows(url: string) {
  return [
    header(),
    ['k', '20080101000000', url, 'text/html', '200', 'D', '1'],
  ];
}

describe('fetchCaptures with a session cache', () => {
  it('serves a repeated URL from the cache without a second fetch', async () => {
    let calls = 0;
    const fetchImpl = (async (endpoint: string) => {
      calls += 1;
      const url = new URLSearchParams(String(endpoint).split('?')[1]).get('url') ?? '';
      return new Response(JSON.stringify({ rows: okRows(url) }), { status: 200 });
    }) as unknown as typeof fetch;

    const cdxCache = createCdxCache();
    const first = await fetchCaptures('http://s/a', { fetch: fetchImpl, cdxCache });
    const second = await fetchCaptures('http://s/a', { fetch: fetchImpl, cdxCache });

    expect(first.ok && second.ok).toBe(true);
    expect(calls).toBe(1); // second call hit the cache
    if (first.ok && second.ok) {
      expect(second.value).toEqual(first.value);
    }
  });

  it('fetches again for a different URL', async () => {
    let calls = 0;
    const fetchImpl = (async (endpoint: string) => {
      calls += 1;
      const url = new URLSearchParams(String(endpoint).split('?')[1]).get('url') ?? '';
      return new Response(JSON.stringify({ rows: okRows(url) }), { status: 200 });
    }) as unknown as typeof fetch;

    const cdxCache = createCdxCache();
    await fetchCaptures('http://s/a', { fetch: fetchImpl, cdxCache });
    await fetchCaptures('http://s/b', { fetch: fetchImpl, cdxCache });
    expect(calls).toBe(2);
  });

  it('does not cache a failed lookup, so it can be retried', async () => {
    let calls = 0;
    const fetchImpl = (async (endpoint: string) => {
      calls += 1;
      const url = new URLSearchParams(String(endpoint).split('?')[1]).get('url') ?? '';
      if (calls === 1) {
        return new Response(JSON.stringify({ error: 'outage' }), { status: 502 });
      }
      return new Response(JSON.stringify({ rows: okRows(url) }), { status: 200 });
    }) as unknown as typeof fetch;

    const cdxCache = createCdxCache();
    const failed = await fetchCaptures('http://s/a', { fetch: fetchImpl, cdxCache });
    const retried = await fetchCaptures('http://s/a', { fetch: fetchImpl, cdxCache });

    expect(failed.ok).toBe(false);
    expect(retried.ok).toBe(true);
    expect(calls).toBe(2); // the error was not cached
  });
});
