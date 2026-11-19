import { describe, it, expect } from 'vitest';
import { cdxEndpoint, fetchCaptures } from '../../src/archive/cdx-client.js';

function recordingFetch(responder: (url: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(String(url));
    return responder(String(url));
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const ROWS = [
  ['urlkey', 'timestamp', 'original', 'mimetype', 'statuscode', 'digest', 'length'],
  ['com,example)/', '20080303120000', 'http://example.com/', 'text/html', '200', 'B', '120'],
];

describe('cdxEndpoint', () => {
  it('builds a relative path to our own proxy', () => {
    const endpoint = cdxEndpoint('http://example.com/page?a=1');
    expect(endpoint.startsWith('/api/cdx?')).toBe(true);
    const query = new URLSearchParams(endpoint.split('?')[1]);
    expect(query.get('url')).toBe('http://example.com/page?a=1');
  });
});

describe('fetchCaptures', () => {
  it('calls our proxy, never archive.org, and parses captures', async () => {
    const { fetchImpl, calls } = recordingFetch(
      () => new Response(JSON.stringify({ rows: ROWS }), { status: 200 }),
    );
    const result = await fetchCaptures('http://example.com/', {
      fetch: fetchImpl,
      baseUrl: 'https://seance.test',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('https://seance.test/api/cdx?');
    expect(calls[0]).not.toContain('web.archive.org');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.timestamp).toBe('20080303120000');
      expect(result.value[0]?.statusCode).toBe(200);
    }
  });

  it('returns an empty capture list when the proxy reports no rows', async () => {
    const { fetchImpl } = recordingFetch(
      () => new Response(JSON.stringify({ rows: [] }), { status: 200 }),
    );
    const result = await fetchCaptures('http://example.com/', { fetch: fetchImpl });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('surfaces a rate-limit as a typed error', async () => {
    const { fetchImpl } = recordingFetch(
      () =>
        new Response(JSON.stringify({ error: 'rate-limited', message: 'slow down' }), {
          status: 429,
        }),
    );
    const result = await fetchCaptures('http://example.com/', { fetch: fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('rate-limited');
      expect(result.error.status).toBe(429);
    }
  });

  it('surfaces an outage as a typed error', async () => {
    const { fetchImpl } = recordingFetch(
      () => new Response(JSON.stringify({ error: 'server-error' }), { status: 502 }),
    );
    const result = await fetchCaptures('http://example.com/', { fetch: fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('outage');
    }
  });

  it('surfaces a thrown fetch as a network error', async () => {
    const fetchImpl = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const result = await fetchCaptures('http://example.com/', { fetch: fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('network');
    }
  });

  it('reports an unexpected body shape as a parse error', async () => {
    const { fetchImpl } = recordingFetch(
      () => new Response(JSON.stringify({ nope: true }), { status: 200 }),
    );
    const result = await fetchCaptures('http://example.com/', { fetch: fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('parse-error');
    }
  });
});
