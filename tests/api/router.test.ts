// The api router dispatches `/api/cdx` and `/api/snapshot` to the two proxies
// and returns null for anything else, so the local dev server (and any single
// -function host) has one entry point. Tested offline with an injected fetch;
// no real network (N2).

import { describe, it, expect, vi } from 'vitest';
import { handleApiRequest } from '../../api/router.js';
import type { HttpDeps, RetryOptions } from '../../api/http.js';

const options: RetryOptions = {
  timeoutMs: 50,
  maxAttempts: 1,
  baseDelayMs: 1,
  maxDelayMs: 1,
};

function deps(fetchImpl: typeof fetch): HttpDeps {
  return { fetch: fetchImpl, sleep: () => Promise.resolve(), random: () => 0 };
}

describe('handleApiRequest', () => {
  it('routes /api/cdx to the CDX proxy', async () => {
    let calledUrl = '';
    const fetchMock = ((input: unknown) => {
      calledUrl = String(input);
      return Promise.resolve(
        new Response(
          JSON.stringify([
            ['urlkey', 'timestamp', 'original', 'mimetype', 'statuscode', 'digest', 'length'],
            ['k', '20080303120000', 'http://x/', 'text/html', '200', 'd', '1'],
          ]),
          { status: 200 },
        ),
      );
    }) as typeof fetch;
    const request = new Request('http://localhost/api/cdx?url=http://x/');
    const response = await handleApiRequest(request, deps(fetchMock), options);

    expect(response).not.toBeNull();
    expect(response?.status).toBe(200);
    const body = (await response?.json()) as { rows: unknown[] };
    expect(Array.isArray(body.rows)).toBe(true);
    // The upstream call went to the archive's CDX endpoint.
    expect(calledUrl).toContain('web.archive.org/cdx/search/cdx');
  });

  it('routes /api/snapshot to the snapshot proxy', async () => {
    let calledUrl = '';
    const fetchMock = ((input: unknown) => {
      calledUrl = String(input);
      return Promise.resolve(
        new Response('<html>old</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      );
    }) as typeof fetch;
    const request = new Request(
      'http://localhost/api/snapshot?url=http://x/&timestamp=20080303120000',
    );
    const response = await handleApiRequest(request, deps(fetchMock), options);

    expect(response?.status).toBe(200);
    expect(response?.headers.get('content-type')).toContain('text/html');
    expect(calledUrl).toContain('web.archive.org/web/20080303120000id_/');
  });

  it('routes /api/swf to the swf CORS proxy', async () => {
    let calledUrl = '';
    const fetchMock = ((input: unknown) => {
      calledUrl = String(input);
      return Promise.resolve(
        new Response(new Uint8Array([0x43, 0x57, 0x53]), {
          status: 200,
          headers: { 'content-type': 'application/x-shockwave-flash' },
        }),
      );
    }) as typeof fetch;
    const archive =
      'https://web.archive.org/web/20051231232721id_/http://x/welcome.swf';
    const request = new Request(
      `http://localhost/api/swf?url=${encodeURIComponent(archive)}`,
    );
    const response = await handleApiRequest(request, deps(fetchMock), options);

    expect(response?.status).toBe(200);
    expect(response?.headers.get('access-control-allow-origin')).toBe('*');
    expect(calledUrl).toBe(archive);
  });

  it('returns null for a path it does not serve', async () => {
    const fetchMock = vi.fn();
    const request = new Request('http://localhost/api/unknown');
    const response = await handleApiRequest(request, deps(fetchMock as never), options);
    expect(response).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
