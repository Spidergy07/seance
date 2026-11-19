import { describe, it, expect } from 'vitest';
import {
  buildCdxRequestUrl,
  fetchCdxRows,
  handleCdxRequest,
} from '../../api/cdx.js';
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
  maxAttempts: 3,
  baseDelayMs: 1,
  maxDelayMs: 4,
};

const SAMPLE_ROWS = [
  ['urlkey', 'timestamp', 'original', 'mimetype', 'statuscode', 'digest', 'length'],
  ['com,example)/', '20080303120000', 'http://example.com/', 'text/html', '200', 'B', '120'],
];

describe('buildCdxRequestUrl', () => {
  it('targets the CDX endpoint with the original URL and output=json', () => {
    const url = buildCdxRequestUrl('http://example.com/page?a=1');
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://web.archive.org');
    expect(parsed.pathname).toBe('/cdx/search/cdx');
    expect(parsed.searchParams.get('url')).toBe('http://example.com/page?a=1');
    expect(parsed.searchParams.get('output')).toBe('json');
    expect(parsed.searchParams.get('fl')).toContain('statuscode');
  });
});

describe('fetchCdxRows', () => {
  it('requests the CDX endpoint with a descriptive User-Agent', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () => new Response(JSON.stringify(SAMPLE_ROWS), { status: 200 }),
    ]);
    await fetchCdxRows('http://example.com/', deps(fetchImpl), fastOptions);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain('/cdx/search/cdx');
    const headers = (calls[0]?.init.headers ?? {}) as Record<string, string>;
    expect(headers['user-agent']).toContain('Seance');
  });

  it('parses the returned rows', async () => {
    const { fetchImpl } = scriptedFetch([
      () => new Response(JSON.stringify(SAMPLE_ROWS), { status: 200 }),
    ]);
    const rows = await fetchCdxRows('http://example.com/', deps(fetchImpl), fastOptions);
    expect(rows).toEqual(SAMPLE_ROWS);
  });

  it('treats an empty body as no captures', async () => {
    const { fetchImpl } = scriptedFetch([
      () => new Response('', { status: 200 }),
    ]);
    const rows = await fetchCdxRows('http://example.com/', deps(fetchImpl), fastOptions);
    expect(rows).toEqual([]);
  });

  it('retries on 429 then returns rows', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () => new Response('', { status: 429 }),
      () => new Response(JSON.stringify(SAMPLE_ROWS), { status: 200 }),
    ]);
    const rows = await fetchCdxRows('http://example.com/', deps(fetchImpl), fastOptions);
    expect(rows).toEqual(SAMPLE_ROWS);
    expect(calls).toHaveLength(2);
  });

  it('gives up after the capped attempts when rate limited throughout', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () => new Response('', { status: 429 }),
      () => new Response('', { status: 429 }),
      () => new Response('', { status: 429 }),
    ]);
    await expect(
      fetchCdxRows('http://example.com/', deps(fetchImpl), fastOptions),
    ).rejects.toMatchObject({ kind: 'rate-limited' });
    expect(calls).toHaveLength(3);
  });

  it('rejects a non-array JSON body as an upstream error', async () => {
    const { fetchImpl } = scriptedFetch([
      () => new Response(JSON.stringify({ oops: true }), { status: 200 }),
    ]);
    await expect(
      fetchCdxRows('http://example.com/', deps(fetchImpl), fastOptions),
    ).rejects.toMatchObject({ kind: 'server-error' });
  });
});

describe('handleCdxRequest', () => {
  function request(urlParam: string | null): Request {
    const base = 'https://seance.example/api/cdx';
    const url = urlParam === null ? base : `${base}?url=${encodeURIComponent(urlParam)}`;
    return new Request(url);
  }

  it('rejects a missing url with 400 and no network call', async () => {
    const { fetchImpl, calls } = scriptedFetch([]);
    const res = await handleCdxRequest(request(null), deps(fetchImpl), fastOptions);
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
    await expect(res.json()).resolves.toMatchObject({ error: 'bad-request' });
  });

  it('rejects a non-http(s) url with 400', async () => {
    const { fetchImpl, calls } = scriptedFetch([]);
    const res = await handleCdxRequest(
      request('ftp://example.com/'),
      deps(fetchImpl),
      fastOptions,
    );
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('returns the rows as JSON on success', async () => {
    const { fetchImpl } = scriptedFetch([
      () => new Response(JSON.stringify(SAMPLE_ROWS), { status: 200 }),
    ]);
    const res = await handleCdxRequest(
      request('http://example.com/'),
      deps(fetchImpl),
      fastOptions,
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ rows: SAMPLE_ROWS });
  });

  it('maps a rate-limit give-up to HTTP 429', async () => {
    const { fetchImpl } = scriptedFetch([
      () => new Response('', { status: 429 }),
      () => new Response('', { status: 429 }),
      () => new Response('', { status: 429 }),
    ]);
    const res = await handleCdxRequest(
      request('http://example.com/'),
      deps(fetchImpl),
      fastOptions,
    );
    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toMatchObject({ error: 'rate-limited' });
  });
});
