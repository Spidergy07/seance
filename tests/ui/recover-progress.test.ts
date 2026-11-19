// Task 34 (R8.10): a successful recovery reports each step it enters through the
// injected `onProgress` callback, in order, so the shell can show which step is
// running instead of one static line. Fully offline with a mocked proxy.

import { describe, it, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import deadHome from '../fixtures/html/dead-home.html?raw';
import { recover, type RecoverDeps } from '../../src/ui/recover.js';
import type { RecoveryStep } from '../../src/ui/progress.js';

const PAGE = 'http://oldsite.example/';

function working(url: string): string {
  return JSON.stringify({
    rows: [
      ['urlkey', 'timestamp', 'original', 'mimetype', 'statuscode', 'digest', 'length'],
      ['key', '20080303120000', url, 'text/html', '200', 'DIG', '100'],
    ],
  });
}

const fetchMock: typeof fetch = ((input: string) => {
  const raw = typeof input === 'string' ? input : (input as Request).url;
  const url = new URL(raw, 'http://app.local');
  if (url.pathname === '/api/snapshot') {
    return Promise.resolve(
      new Response(deadHome, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );
  }
  return Promise.resolve(
    new Response(working(url.searchParams.get('url') ?? ''), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    }),
  );
}) as unknown as typeof fetch;

function deps(): RecoverDeps {
  return {
    fetch: fetchMock,
    parseHtml: (html) => parseHTML(html).document as unknown as Document,
    serialize: (doc) =>
      `<!doctype html>${(doc.documentElement as unknown as { outerHTML: string }).outerHTML}`,
  };
}

describe('recover reports progress', () => {
  it('reports every step in running order for a successful recovery', async () => {
    const steps: RecoveryStep[] = [];
    const outcome = await recover(PAGE, deps(), {
      onProgress: (step) => steps.push(step),
    });

    expect(outcome.ok).toBe(true);
    expect(steps).toEqual([
      'contacting',
      'retrieving',
      'rebuilding',
      'checking',
      'reading',
    ]);
  });
});
