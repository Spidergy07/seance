// Task 46: the Wayback MCP server's tool logic, driven by a mocked fetch so the
// suite stays offline (no test touches the live archive, N2). It exercises the
// three tools: cdx_search (parsing + day collapse), check_capture (exact and
// closest), and find_swf (.swf detection from fixture HTML), plus URL
// validation.

import { describe, it, expect, vi } from 'vitest';
import {
  cdxSearch,
  checkCapture,
  findSwf,
  type WaybackDeps,
} from '../../tools/wayback-mcp/src/wayback.js';

/** A fetch mock that answers from a map of url-substring → response body. */
function mockHttp(
  responder: (url: string) => { body: string; status?: number },
): { deps: WaybackDeps; calls: string[] } {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string) => {
    calls.push(url);
    const { body, status = 200 } = responder(url);
    return new Response(body, { status });
  });
  const deps: WaybackDeps = {
    http: {
      fetch: fetchMock as unknown as typeof fetch,
      sleep: async () => {},
      random: () => 0,
    },
  };
  return { deps, calls };
}

const HEADER = ['urlkey', 'timestamp', 'original', 'mimetype', 'statuscode', 'digest', 'length'];

describe('cdx_search', () => {
  it('parses rows, collapses to one capture per day, newest first', async () => {
    const rows = JSON.stringify([
      HEADER,
      ['x', '20040325185740', 'http://ex.example/intro.swf', 'application/x-shockwave-flash', '200', 'd1', '1'],
      ['x', '20040325190000', 'http://ex.example/intro.swf', 'text/html', '200', 'd2', '1'],
      ['x', '20060626144354', 'http://ex.example/intro.swf', 'text/html', '200', 'd3', '1'],
    ]);
    const { deps, calls } = mockHttp(() => ({ body: rows }));

    const result = await cdxSearch({ url: 'http://ex.example/intro.swf' }, deps);

    // One query, to the archive CDX endpoint, with the 200 filter and json.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('web.archive.org/cdx/search/cdx');
    expect(calls[0]).toContain('filter=statuscode%3A200');
    expect(calls[0]).toContain('output=json');

    // Two days remain; the 2004 day keeps its newest 200 capture.
    expect(result.count).toBe(2);
    expect(result.captures[0]?.timestamp).toBe('20060626144354');
    expect(result.captures[1]?.timestamp).toBe('20040325190000');
    expect(result.captures[0]?.archiveUrl).toContain('web.archive.org/web/20060626144354/');
  });

  it('can return every capture without the day collapse or 200 filter', async () => {
    const rows = JSON.stringify([
      HEADER,
      ['x', '20040325185740', 'http://ex.example/', 'text/html', '200', 'd1', '1'],
      ['x', '20040325190000', 'http://ex.example/', 'text/html', '301', 'd2', '1'],
    ]);
    const { deps, calls } = mockHttp(() => ({ body: rows }));

    const result = await cdxSearch(
      { url: 'http://ex.example/', onlyWorking: false, collapseDaily: false },
      deps,
    );
    expect(result.count).toBe(2);
    expect(calls[0]).not.toContain('filter=statuscode');
  });

  it('rejects a non-http(s) url without a fetch', async () => {
    const { deps, calls } = mockHttp(() => ({ body: '[]' }));
    await expect(cdxSearch({ url: 'ftp://ex.example/x' }, deps)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe('check_capture', () => {
  const rows = JSON.stringify([
    HEADER,
    ['x', '20001017124759', 'http://www.geocities.com/Athens/', 'text/html', '200', 'd1', '1'],
    ['x', '20001017235959', 'http://www.geocities.com/Athens/', 'text/html', '301', 'd2', '1'],
  ]);

  it('reports the exact capture when the timestamp matches', async () => {
    const { deps } = mockHttp(() => ({ body: rows }));
    const result = await checkCapture(
      { url: 'http://www.geocities.com/Athens/', timestamp: '20001017124759' },
      deps,
    );
    expect(result.exact).toBe(true);
    expect(result.capture?.statusCode).toBe(200);
  });

  it('falls back to the closest capture by time', async () => {
    const { deps } = mockHttp(() => ({ body: rows }));
    const result = await checkCapture(
      { url: 'http://www.geocities.com/Athens/', timestamp: '20001017120000' },
      deps,
    );
    expect(result.exact).toBe(false);
    expect(result.capture?.timestamp).toBe('20001017124759');
  });

  it('returns no capture when the day has none', async () => {
    const { deps } = mockHttp(() => ({ body: '[]' }));
    const result = await checkCapture(
      { url: 'http://www.geocities.com/Athens/', timestamp: '20001017120000' },
      deps,
    );
    expect(result.capture).toBeNull();
  });

  it('rejects a malformed timestamp', async () => {
    const { deps } = mockHttp(() => ({ body: rows }));
    await expect(
      checkCapture({ url: 'http://ex.example/', timestamp: '2000' }, deps),
    ).rejects.toThrow();
  });
});

describe('find_swf', () => {
  it('finds .swf references in the capture HTML (two archive requests)', async () => {
    const cdx = JSON.stringify([
      HEADER,
      ['x', '20060626144354', 'http://ex.example/', 'text/html', '200', 'd3', '1'],
    ]);
    const html =
      '<html><body>' +
      '<object data="intro.swf"></object>' +
      '<embed src="http://ex.example/nav.swf">' +
      '<object><param name="movie" value="/deep/game.swf"></object>' +
      '<a href="notflash.html">x</a>' +
      '</body></html>';

    const { deps, calls } = mockHttp((url) =>
      url.includes('/cdx/search/') ? { body: cdx } : { body: html },
    );

    const result = await findSwf({ url: 'http://ex.example/', year: '2006' }, deps);

    expect(calls).toHaveLength(2);
    expect(result.capture?.timestamp).toBe('20060626144354');
    const urls = result.swf.map((s) => s.originalUrl).sort();
    expect(urls).toEqual([
      'http://ex.example/deep/game.swf',
      'http://ex.example/intro.swf',
      'http://ex.example/nav.swf',
    ]);
    // Each .swf is pointed at the raw (id_) archive bytes at the page timestamp.
    expect(result.swf[0]?.archiveUrl).toContain('/web/20060626144354id_/');
  });

  it('reports no capture when none is found in the year', async () => {
    const { deps, calls } = mockHttp(() => ({ body: '[]' }));
    const result = await findSwf({ url: 'http://ex.example/', year: '1999' }, deps);
    expect(result.capture).toBeNull();
    expect(result.swf).toHaveLength(0);
    expect(calls).toHaveLength(1); // only the CDX query; no page fetch
  });
});
