import { describe, it, expect } from 'vitest';
import {
  fetchSnapshot,
  snapshotEndpoint,
} from '../../src/archive/snapshot-client.js';

function recordingFetch(responder: (url: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(String(url));
    return responder(String(url));
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('snapshotEndpoint', () => {
  it('builds a relative path to our own proxy with url and timestamp', () => {
    const endpoint = snapshotEndpoint('http://example.com/a.html', '20080303120000');
    expect(endpoint.startsWith('/api/snapshot?')).toBe(true);
    const query = new URLSearchParams(endpoint.split('?')[1]);
    expect(query.get('url')).toBe('http://example.com/a.html');
    expect(query.get('timestamp')).toBe('20080303120000');
  });
});

describe('fetchSnapshot', () => {
  it('calls our proxy, never archive.org, and returns the body and type', async () => {
    const { fetchImpl, calls } = recordingFetch(
      () =>
        new Response('<html><body>hi</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    );
    const result = await fetchSnapshot('http://example.com/', '20080303120000', {
      fetch: fetchImpl,
      baseUrl: 'https://seance.test',
    });
    expect(calls[0]).toContain('https://seance.test/api/snapshot?');
    expect(calls[0]).not.toContain('web.archive.org');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.body).toContain('hi');
      expect(result.value.contentType).toBe('text/html; charset=utf-8');
    }
  });

  it('surfaces a timeout as a typed error', async () => {
    const { fetchImpl } = recordingFetch(
      () => new Response(JSON.stringify({ error: 'timeout' }), { status: 504 }),
    );
    const result = await fetchSnapshot('http://example.com/', '20080303120000', {
      fetch: fetchImpl,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('timeout');
      expect(result.error.status).toBe(504);
    }
  });

  it('surfaces a thrown fetch as a network error', async () => {
    const fetchImpl = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const result = await fetchSnapshot('http://example.com/', '20080303120000', {
      fetch: fetchImpl,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('network');
    }
  });
});
