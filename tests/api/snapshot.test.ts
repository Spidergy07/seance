import { describe, it, expect } from 'vitest';
import {
  buildSnapshotRequestUrl,
  fetchSnapshotResponse,
  handleSnapshotRequest,
} from '../../api/snapshot.js';
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

describe('buildSnapshotRequestUrl', () => {
  it('builds a raw (id_) archive URL for the snapshot', () => {
    const url = buildSnapshotRequestUrl('http://example.com/a.html', '20080303120000');
    expect(url).toBe('https://web.archive.org/web/20080303120000id_/http://example.com/a.html');
  });
});

describe('fetchSnapshotResponse', () => {
  it('requests the raw archive URL with a descriptive User-Agent', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () => new Response('<html></html>', { status: 200 }),
    ]);
    await fetchSnapshotResponse(
      { originalUrl: 'http://example.com/', timestamp: '20080303120000' },
      deps(fetchImpl),
      fastOptions,
    );
    expect(calls[0]?.url).toBe('https://web.archive.org/web/20080303120000id_/http://example.com/');
    const headers = (calls[0]?.init.headers ?? {}) as Record<string, string>;
    expect(headers['user-agent']).toContain('Seance');
  });

  it('aborts an attempt that exceeds the timeout', async () => {
    let aborted = false;
    const hangingFetch = ((_url: string, init: RequestInit = {}) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init.signal as AbortSignal | undefined;
        signal?.addEventListener('abort', () => {
          aborted = true;
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      })) as unknown as typeof fetch;

    await expect(
      fetchSnapshotResponse(
        { originalUrl: 'http://example.com/', timestamp: '20080303120000' },
        deps(hangingFetch),
        { ...fastOptions, maxAttempts: 1, timeoutMs: 20 },
      ),
    ).rejects.toMatchObject({ kind: 'timeout' });
    expect(aborted).toBe(true);
  });
});

describe('handleSnapshotRequest', () => {
  function request(params: Record<string, string>): Request {
    const url = new URL('https://seance.example/api/snapshot');
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    return new Request(url.toString());
  }

  it('rejects a missing url with 400 and no network call', async () => {
    const { fetchImpl, calls } = scriptedFetch([]);
    const res = await handleSnapshotRequest(
      request({ timestamp: '20080303120000' }),
      deps(fetchImpl),
      fastOptions,
    );
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('rejects a malformed timestamp with 400 and no network call', async () => {
    const { fetchImpl, calls } = scriptedFetch([]);
    const res = await handleSnapshotRequest(
      request({ url: 'http://example.com/', timestamp: '2008' }),
      deps(fetchImpl),
      fastOptions,
    );
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('relays the snapshot bytes with the upstream content type', async () => {
    const { fetchImpl } = scriptedFetch([
      () =>
        new Response('<html><body>hi</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    ]);
    const res = await handleSnapshotRequest(
      request({ url: 'http://example.com/', timestamp: '20080303120000' }),
      deps(fetchImpl),
      fastOptions,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    await expect(res.text()).resolves.toContain('hi');
  });

  it('maps an upstream outage to HTTP 502', async () => {
    const { fetchImpl } = scriptedFetch([
      () => new Response('', { status: 500 }),
      () => new Response('', { status: 500 }),
    ]);
    const res = await handleSnapshotRequest(
      request({ url: 'http://example.com/', timestamp: '20080303120000' }),
      deps(fetchImpl),
      fastOptions,
    );
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({ error: 'server-error' });
  });
});
