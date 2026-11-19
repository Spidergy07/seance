// Task 32 (R8.7, R8.8): a full recovery of a multi-asset page must make only a
// handful of archive requests, and re-recovering the same page must make no new
// CDX request (the session cache). Fully offline: one mocked `fetch` answers
// `/api/cdx` and `/api/snapshot` and counts the calls.

import { describe, it, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import sampleHtml from '../fixtures/html/sample.html?raw';
import { recover, type RecoverDeps } from '../../src/ui/recover.js';
import { createCdxCache } from '../../src/archive/cdx-cache.js';

const PAGE = 'http://oldsite.example/';

function working(url: string): string {
  return JSON.stringify({
    rows: [
      ['urlkey', 'timestamp', 'original', 'mimetype', 'statuscode', 'digest', 'length'],
      ['key', '20080303120000', url, 'text/html', '200', 'DIG', '100'],
    ],
  });
}

function countingFetch() {
  const counts = { cdx: 0, snapshot: 0 };
  const fetchImpl = ((input: string) => {
    const raw = typeof input === 'string' ? input : (input as Request).url;
    const url = new URL(raw, 'http://app.local');
    if (url.pathname === '/api/snapshot') {
      counts.snapshot += 1;
      return Promise.resolve(
        new Response(sampleHtml, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
      );
    }
    if (url.pathname === '/api/cdx') {
      counts.cdx += 1;
      const target = url.searchParams.get('url') ?? '';
      return Promise.resolve(
        new Response(working(target), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        }),
      );
    }
    return Promise.reject(new Error(`unexpected request to ${url.pathname}`));
  }) as unknown as typeof fetch;
  return { fetchImpl, counts };
}

function deps(fetchImpl: typeof fetch, cdxCache = createCdxCache()): RecoverDeps {
  return {
    fetch: fetchImpl,
    cdxCache,
    parseHtml: (html) => parseHTML(html).document as unknown as Document,
    serialize: (doc) =>
      `<!doctype html>${(doc.documentElement as unknown as { outerHTML: string }).outerHTML}`,
  };
}

describe('recovery archive traffic is bounded', () => {
  it('makes at most six archive requests for a multi-asset page', async () => {
    const { fetchImpl, counts } = countingFetch();
    const outcome = await recover(PAGE, deps(fetchImpl));
    expect(outcome.ok).toBe(true);

    // sample.html references 13 element-level assets. Without a cap that would
    // be 13 CDX requests; with the cap it is at most 4, plus the page CDX and
    // the snapshot.
    expect(counts.cdx + counts.snapshot).toBeLessThanOrEqual(6);
    expect(counts.snapshot).toBe(1);
  });

  it('leaves assets past the cap unknown rather than recovered', async () => {
    const { fetchImpl } = countingFetch();
    const outcome = await recover(PAGE, deps(fetchImpl));
    if (!outcome.ok) {
      throw new Error('expected a recovered view');
    }
    const unknown = outcome.view.report.assets.filter((a) => a.status === 'unknown');
    // 13 assets, at most 4 checked → at least 9 unknown.
    expect(unknown.length).toBeGreaterThanOrEqual(9);
  });

  it('makes no new CDX request when the same page is recovered again', async () => {
    const { fetchImpl, counts } = countingFetch();
    const cache = createCdxCache();

    await recover(PAGE, deps(fetchImpl, cache));
    const cdxAfterFirst = counts.cdx;

    await recover(PAGE, deps(fetchImpl, cache));
    // Every CDX lookup (page + checked assets) was cached on the first run.
    expect(counts.cdx).toBe(cdxAfterFirst);
    // The snapshot is not cached, so it is fetched once per recovery.
    expect(counts.snapshot).toBe(2);
  });
});
