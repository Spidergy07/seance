import { describe, it, expect } from 'vitest';
import { createCaptureLookup } from '../../src/archive/capture-lookup.js';

function header() {
  return ['urlkey', 'timestamp', 'original', 'mimetype', 'statuscode', 'digest', 'length'];
}

// A fetch that answers each /api/cdx call based on its `url` query parameter.
function cdxFetch(rowsByUrl: Record<string, string[][] | 'error'>) {
  const calls: string[] = [];
  const fetchImpl = (async (endpoint: string) => {
    calls.push(String(endpoint));
    const params = new URLSearchParams(String(endpoint).split('?')[1]);
    const url = params.get('url') ?? '';
    const entry = rowsByUrl[url];
    if (entry === undefined || entry === 'error') {
      return new Response(JSON.stringify({ error: 'outage' }), { status: 502 });
    }
    return new Response(JSON.stringify({ rows: entry }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('createCaptureLookup', () => {
  it('maps working captures, no-capture, and failed lookups correctly', async () => {
    const working = [
      header(),
      ['a', '20080101000000', 'http://s/ok.js', 'application/javascript', '200', 'D', '1'],
      ['a', '20090101000000', 'http://s/ok.js', 'application/javascript', '200', 'E', '1'],
    ];
    const onlyErrors = [
      header(),
      ['b', '20080101000000', 'http://s/bad.png', 'image/png', '404', 'F', '1'],
    ];

    const { fetchImpl } = cdxFetch({
      'http://s/ok.js': working,
      'http://s/bad.png': onlyErrors,
      'http://s/down.css': 'error',
    });

    const lookup = createCaptureLookup({ fetch: fetchImpl });
    const map = await lookup(['http://s/ok.js', 'http://s/bad.png', 'http://s/down.css']);

    // Working capture → the most recent 200.
    expect(map.get('http://s/ok.js')?.timestamp).toBe('20090101000000');
    expect(map.get('http://s/ok.js')?.statusCode).toBe(200);
    // Captures exist but none are 200 → null (missing).
    expect(map.has('http://s/bad.png')).toBe(true);
    expect(map.get('http://s/bad.png')).toBeNull();
    // Lookup failed → absent key (unknown).
    expect(map.has('http://s/down.css')).toBe(false);
  });

  it('queries only our own proxy, never archive.org', async () => {
    const { fetchImpl, calls } = cdxFetch({ 'http://s/ok.js': [header()] });
    const lookup = createCaptureLookup({ fetch: fetchImpl, baseUrl: 'https://seance.test' });
    await lookup(['http://s/ok.js']);
    expect(calls[0]).toContain('https://seance.test/api/cdx?');
    expect(calls[0]).not.toContain('web.archive.org');
  });

  it('runs at most two lookups at once by default (R8.7)', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchImpl = (async (endpoint: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      const url = new URLSearchParams(String(endpoint).split('?')[1]).get('url') ?? '';
      return new Response(JSON.stringify({ rows: [header(), [
        'k', '20080101000000', url, 'text/html', '200', 'D', '1',
      ]] }), { status: 200 });
    }) as unknown as typeof fetch;

    const lookup = createCaptureLookup({ fetch: fetchImpl });
    const urls = ['a', 'b', 'c', 'd', 'e', 'f'].map((p) => `http://s/${p}`);
    const map = await lookup(urls);

    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(map.size).toBe(urls.length);
  });
});
