// Task 51 (R2.7): when the most recent 200 capture is a redirect stub, the
// default recovery shows and dates the most recent real-content capture
// instead, not the stub. An explicit picker choice is still shown as-is.
// Fully offline: a mocked `fetch` answers /api/cdx and /api/snapshot.

import { describe, it, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { recover, type RecoverDeps } from '../../src/ui/recover.js';

const PAGE = 'http://kids.example/';
const STUB_TS = '20111220133511';
const REAL_TS = '20060101000000';

const STUB_HTML =
  '<!doctype html><html><head><title>Moved</title></head>' +
  "<body><script>window.location.href='http://www.example.gov/new/';</script>" +
  '</body></html>';
const REAL_HTML =
  '<!doctype html><html><head><title>Real site</title></head>' +
  '<body><h1>Welcome to the real page</h1><p>Lots of real content here.</p></body></html>';

function cdxBody(): string {
  return JSON.stringify({
    rows: [
      ['urlkey', 'timestamp', 'original', 'mimetype', 'statuscode', 'digest', 'length'],
      ['k', STUB_TS, PAGE, 'text/html', '200', 'STUBDIGEST', '714'],
      ['k', REAL_TS, PAGE, 'text/html', '200', 'REALDIGEST', '1453'],
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
      const ts = url.searchParams.get('timestamp');
      const body = ts === STUB_TS ? STUB_HTML : REAL_HTML;
      return Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
      );
    }
    if (url.pathname === '/api/cdx') {
      counts.cdx += 1;
      const target = url.searchParams.get('url') ?? '';
      // Only the page itself has captures; asset lookups find nothing.
      const body = target === PAGE ? cdxBody() : JSON.stringify({ rows: [] });
      return Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        }),
      );
    }
    return Promise.reject(new Error(`unexpected request to ${url.pathname}`));
  }) as unknown as typeof fetch;
  return { fetchImpl, counts };
}

function deps(fetchImpl: typeof fetch): RecoverDeps {
  return {
    fetch: fetchImpl,
    parseHtml: (html) => parseHTML(html).document as unknown as Document,
    serialize: (doc) =>
      `<!doctype html>${(doc.documentElement as unknown as { outerHTML: string }).outerHTML}`,
  };
}

describe('recovery skips a trailing redirect stub (R2.7)', () => {
  it('shows and dates the last real capture when the newest 200 is a stub', async () => {
    const { fetchImpl, counts } = countingFetch();
    const outcome = await recover(PAGE, deps(fetchImpl));
    if (!outcome.ok) {
      throw new Error(`expected a recovered view, got ${outcome.kind}`);
    }
    // The shown capture and the death date are the real content, not the stub.
    expect(outcome.view.selectedCapture.timestamp).toBe(REAL_TS);
    expect(outcome.view.report.lastWorkingCapture?.timestamp).toBe(REAL_TS);
    // One snapshot to classify the stub, one for the real page it falls back to.
    expect(counts.snapshot).toBe(2);
  });

  it('shows the stub as-is when the visitor explicitly picks it', async () => {
    const { fetchImpl, counts } = countingFetch();
    const outcome = await recover(PAGE, deps(fetchImpl), { timestamp: STUB_TS });
    if (!outcome.ok) {
      throw new Error(`expected a recovered view, got ${outcome.kind}`);
    }
    expect(outcome.view.selectedCapture.timestamp).toBe(STUB_TS);
    // No stub detection on an explicit pick: only the picked capture is fetched.
    expect(counts.snapshot).toBe(1);
  });
});
