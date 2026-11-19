// Task 35: the `.swf` CORS proxy. It serves archived Flash bytes to the
// in-frame Ruffle player with an Access-Control-Allow-Origin header, fetching
// only from web.archive.org. Tested offline with an injected fetch (N2).

import { describe, it, expect } from 'vitest';
import { handleSwfRequest } from '../../api/swf.js';
import type { HttpDeps, RetryOptions } from '../../api/http.js';

function scriptedFetch(script: Array<() => Response | Promise<Response>>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let index = 0;
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const factory = script[index];
    index += 1;
    if (!factory) {
      throw new Error(`unexpected fetch call #${index}`);
    }
    return factory();
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function deps(fetchImpl: typeof fetch): HttpDeps {
  return { fetch: fetchImpl, sleep: async () => {}, random: () => 0.5 };
}

const fastOptions: RetryOptions = {
  timeoutMs: 50,
  maxAttempts: 2,
  baseDelayMs: 1,
  maxDelayMs: 4,
};

const ARCHIVE_SWF =
  'https://web.archive.org/web/20051231232721id_/http://www.homestarrunner.com/welcome.swf';

function request(params: Record<string, string>): Request {
  const url = new URL('https://seance.example/api/swf');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new Request(url.toString());
}

describe('handleSwfRequest', () => {
  it('relays the swf bytes with a CORS header and a Flash content type', async () => {
    const body = new Uint8Array([0x43, 0x57, 0x53]); // "CWS"
    const { fetchImpl, calls } = scriptedFetch([
      () =>
        new Response(body, {
          status: 200,
          headers: { 'content-type': 'application/x-shockwave-flash' },
        }),
    ]);
    const res = await handleSwfRequest(request({ url: ARCHIVE_SWF }), deps(fetchImpl), fastOptions);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('content-type')).toContain('shockwave-flash');
    // It fetched the exact archive URL.
    expect(calls[0]?.url).toBe(ARCHIVE_SWF);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes)).toEqual([0x43, 0x57, 0x53]);
  });

  it('defaults the content type to Flash when upstream omits it', async () => {
    const { fetchImpl } = scriptedFetch([() => new Response(new Uint8Array([1]), { status: 200 })]);
    const res = await handleSwfRequest(request({ url: ARCHIVE_SWF }), deps(fetchImpl), fastOptions);
    expect(res.headers.get('content-type')).toBe('application/x-shockwave-flash');
  });

  it('maps a generic octet-stream to the Flash content type', async () => {
    const { fetchImpl } = scriptedFetch([
      () =>
        new Response(new Uint8Array([0x43, 0x57, 0x53]), {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        }),
    ]);
    const res = await handleSwfRequest(request({ url: ARCHIVE_SWF }), deps(fetchImpl), fastOptions);
    expect(res.headers.get('content-type')).toBe('application/x-shockwave-flash');
  });

  it('rejects a missing url with 400 and no fetch', async () => {
    const { fetchImpl, calls } = scriptedFetch([]);
    const res = await handleSwfRequest(request({}), deps(fetchImpl), fastOptions);
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('rejects a non-archive host with 400 and no fetch (not an open proxy)', async () => {
    const { fetchImpl, calls } = scriptedFetch([]);
    const res = await handleSwfRequest(
      request({ url: 'https://evil.example/web/1/x.swf' }),
      deps(fetchImpl),
      fastOptions,
    );
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('maps an upstream outage to HTTP 502', async () => {
    const { fetchImpl } = scriptedFetch([
      () => new Response('', { status: 500 }),
      () => new Response('', { status: 500 }),
    ]);
    const res = await handleSwfRequest(request({ url: ARCHIVE_SWF }), deps(fetchImpl), fastOptions);
    expect(res.status).toBe(502);
  });
});
