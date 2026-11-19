// Task 33 (R8.8 proxy side): the CDX proxy keeps a short-lived in-memory cache
// keyed by the queried URL, so a repeated query within the session makes no new
// upstream request. The cache is ephemeral and stores no user identity (R9.5).

import { describe, it, expect } from 'vitest';
import { createCdxMemoryCache, handleCdxRequest } from '../../api/cdx.js';
import type { HttpDeps, RetryOptions } from '../../api/http.js';

function scriptedFetch(script: Array<() => Response | Promise<Response>>) {
  const calls: string[] = [];
  let index = 0;
  const fetchImpl = (async (url: string) => {
    calls.push(String(url));
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

const SAMPLE_ROWS = [
  ['urlkey', 'timestamp', 'original', 'mimetype', 'statuscode', 'digest', 'length'],
  ['com,example)/', '20080303120000', 'http://example.com/', 'text/html', '200', 'B', '120'],
];

function request(): Request {
  return new Request('https://seance.example/api/cdx?url=http%3A%2F%2Fexample.com%2F');
}

describe('CDX proxy cache', () => {
  it('serves a repeated query from the cache without a second upstream call', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () => new Response(JSON.stringify(SAMPLE_ROWS), { status: 200 }),
    ]);
    const cache = createCdxMemoryCache();

    const r1 = await handleCdxRequest(request(), deps(fetchImpl), fastOptions, cache);
    const r2 = await handleCdxRequest(request(), deps(fetchImpl), fastOptions, cache);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    await expect(r1.json()).resolves.toEqual({ rows: SAMPLE_ROWS });
    await expect(r2.json()).resolves.toEqual({ rows: SAMPLE_ROWS });
    expect(calls).toHaveLength(1); // the second query hit the cache
  });

  it('does not cache a failed upstream, so it can be retried', async () => {
    const { fetchImpl } = scriptedFetch([
      () => new Response('', { status: 502 }),
      () => new Response('', { status: 502 }),
      () => new Response(JSON.stringify(SAMPLE_ROWS), { status: 200 }),
    ]);
    const cache = createCdxMemoryCache();

    const failed = await handleCdxRequest(request(), deps(fetchImpl), fastOptions, cache);
    const retried = await handleCdxRequest(request(), deps(fetchImpl), fastOptions, cache);

    expect(failed.status).toBeGreaterThanOrEqual(500);
    expect(retried.status).toBe(200);
  });
});
