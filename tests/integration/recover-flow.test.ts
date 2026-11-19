// End-to-end wiring test (task 22, design.md §3). It drives the whole flow
// offline with recorded fixtures: input → archive clients (mocked `fetch`) →
// capture selection → document rewrite → asset status → recovery report →
// reader extraction → Flash handling, then renders the three panes from the
// resulting view and asserts what the visitor sees.
//
// No real network: a single `fetch` mock answers `/api/cdx` and `/api/snapshot`
// from fixtures, so the proxy boundary and the client parsing are exercised
// without touching archive.org (N2).

import { describe, it, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import deadHome from '../fixtures/html/dead-home.html?raw';
import { interpretUrlInput, resolvedUrl } from '../../src/ui/url-input-logic.js';
import { recover, type RecoverDeps } from '../../src/ui/recover.js';
import type { RecoveryOutcome } from '../../src/ui/types.js';
import { DeathCertificate } from '../../src/ui/DeathCertificate.js';
import { ReaderPane } from '../../src/ui/ReaderPane.js';
import { RestoredPane } from '../../src/ui/RestoredPane.js';

const PAGE = 'http://oldsite.example/';
const TS = '20080303120000';

/** One CDX success body with a single working (200) capture at `TS`. */
function working(url: string): string {
  return JSON.stringify({
    rows: [
      ['urlkey', 'timestamp', 'original', 'mimetype', 'statuscode', 'digest', 'length'],
      ['key', TS, url, 'text/html', '200', 'DIG', '100'],
    ],
  });
}

function json(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * The mocked proxy. `/api/snapshot` returns the archived HTML; `/api/cdx`
 * returns a working capture for most URLs, empty rows for the missing image,
 * and an upstream failure for the script (so its status stays undetermined =
 * unknown).
 */
const fetchMock: typeof fetch = (input) => {
  const raw = typeof input === 'string' ? input : (input as Request).url;
  const url = new URL(raw, 'http://app.local');
  const target = url.searchParams.get('url') ?? '';

  if (url.pathname === '/api/snapshot') {
    return Promise.resolve(
      new Response(deadHome, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );
  }
  if (url.pathname === '/api/cdx') {
    if (target.endsWith('/missing.png')) {
      return Promise.resolve(json(JSON.stringify({ rows: [] })));
    }
    if (target.endsWith('/app.js')) {
      // An upstream failure: the lookup cannot determine a status → unknown.
      return Promise.resolve(
        json(JSON.stringify({ error: 'outage', message: 'archive down' }), 502),
      );
    }
    return Promise.resolve(json(working(target)));
  }
  return Promise.reject(new Error(`unexpected request to ${url.pathname}`));
};

function deps(): RecoverDeps {
  return {
    fetch: fetchMock,
    parseHtml: (html) => parseHTML(html).document as unknown as Document,
    serialize: (doc) =>
      `<!doctype html>${(doc.documentElement as unknown as { outerHTML: string }).outerHTML}`,
    lookupConcurrency: 4,
    // This test verifies full asset accounting, so lift the per-recovery check
    // cap (R8.7) above the five assets in the fixture.
    maxCheckedAssets: 10,
    // Route recovered .swf through our CORS proxy, as the browser does.
    swfProxyBase: 'https://seance.example/api/swf',
  };
}

async function run(): Promise<Extract<RecoveryOutcome, { ok: true }>> {
  // Input step: the visitor types the address; the URL logic resolves it.
  const interpretation = interpretUrlInput(PAGE);
  const url = resolvedUrl(interpretation);
  expect(url).toBe(PAGE);

  const outcome = await recover(url as string, deps());
  if (!outcome.ok) {
    throw new Error(`expected a recovered view, got ${outcome.kind}`);
  }
  return outcome;
}

describe('end-to-end recovery flow (fixtures)', () => {
  it('produces an honest recovery report from the archived page', async () => {
    const { view } = await run();
    const { report } = view;

    // style.css, logo.png, intro.swf → recovered; missing.png → missing;
    // app.js → unknown. Five element-level assets in total, but only four were
    // checked (the unknown one is not in the percent denominator, task 53).
    expect(report.totalCount).toBe(5);
    expect(report.recoveredCount).toBe(3);
    expect(report.recoveryPercent).toBe(75);

    const statusOf = (suffix: string) =>
      report.assets.find((a) => a.originalUrl.endsWith(suffix))?.status;
    expect(statusOf('/style.css')).toBe('recovered');
    expect(statusOf('/logo.png')).toBe('recovered');
    expect(statusOf('/intro.swf')).toBe('recovered');
    expect(statusOf('/missing.png')).toBe('missing');
    expect(statusOf('/app.js')).toBe('unknown');

    // The certificate dates come from the selected / last-working capture.
    expect(report.selectedCapture.timestamp).toBe(TS);
    expect(report.lastWorkingCapture?.timestamp).toBe(TS);
  });

  it('rewrites the restored page to load only from the archive', async () => {
    const { view } = await run();
    // Every rewritten resource points at the archive; no live-web host leaks.
    expect(view.restoredHtml).toContain('https://web.archive.org/web/');
    expect(view.restoredHtml).not.toMatch(/(src|href)="https?:\/\/oldsite\.example/);
    // The recovered .swf stays in the document for Ruffle to play.
    expect(view.hasFlash).toBe(true);
    // The recovered .swf is routed through our same-origin CORS proxy so
    // Ruffle in the opaque-origin iframe can fetch it; the target is still an
    // archive URL (confinement preserved via the proxy).
    expect(view.restoredHtml).toContain('https://seance.example/api/swf?url=');
    const proxied = /\/api\/swf\?url=([^"'&]+)/.exec(view.restoredHtml);
    expect(proxied).not.toBeNull();
    expect(decodeURIComponent(proxied?.[1] ?? '')).toContain('web.archive.org');
  });

  it('renders the death certificate with counts and percent', async () => {
    const { view } = await run();
    const html = renderToStaticMarkup(
      createElement(DeathCertificate, { report: view.report }),
    );
    expect(html).toContain('3 of 4 checked files came back');
    expect(html).toContain('75');
    // The missing image is named in the report.
    expect(html).toContain('missing.png');
  });

  it('renders a reader view with archive-pointed images', async () => {
    const { view } = await run();
    expect(view.reader.ok).toBe(true);
    const html = renderToStaticMarkup(
      createElement(ReaderPane, { reader: view.reader }),
    );
    expect(html).toContain('Mill Lane');
    expect(html).toContain('https://web.archive.org/web/');
  });

  it('renders the restored pane as a sandboxed iframe that loads Ruffle', async () => {
    const { view } = await run();
    const html = renderToStaticMarkup(
      createElement(RestoredPane, {
        html: view.restoredHtml,
        pageOriginalUrl: view.pageOriginalUrl,
        onNavigate: () => {},
        hasFlash: view.hasFlash,
      }),
    );
    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).not.toContain('allow-same-origin');
    // Ruffle is loaded because the page has a playable .swf.
    expect(html).toContain('ruffle');
  });
});
