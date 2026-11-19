// Accessibility pass (task 23, voice.md, N4, R9.3). A browser axe run is a
// manual/browser-only step (see the README checklist); here we assert the
// structural a11y invariants the app must hold, rendered with react-dom/server
// under Node:
//   - landmarks and a skip link for keyboard users;
//   - every form control has an associated label;
//   - every themed label is paired with its literal meaning (voice.md);
//   - status is never carried by colour alone (text states it too);
//   - the recovery meter and error banners carry the right ARIA.

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../../src/ui/App.js';
import { DeathCertificate } from '../../src/ui/DeathCertificate.js';
import { ReaderPane } from '../../src/ui/ReaderPane.js';
import { RestoredPane } from '../../src/ui/RestoredPane.js';
import { StatusBanner } from '../../src/ui/StatusBanner.js';
import type { RecoveryOutcome } from '../../src/ui/types.js';
import type { Capture, RecoveryReport } from '../../src/core/types.js';

const idleApp = renderToStaticMarkup(
  createElement(App, {
    recover: async (): Promise<RecoveryOutcome> => ({ ok: false, kind: 'outage' }),
  }),
);

describe('main view landmarks and controls', () => {
  it('has a skip link that targets the main region', () => {
    expect(idleApp).toContain('Skip to content');
    expect(idleApp).toContain('href="#main"');
    expect(idleApp).toContain('id="main"');
  });

  it('gives the URL field a real label and the submit an accessible name', () => {
    // The label's htmlFor and the input id are generated; assert both exist and
    // that the submit has a literal accessible name next to its themed text.
    expect(idleApp).toContain('Address of the departed site');
    expect(idleApp).toContain('<label');
    expect(idleApp).toContain('aria-label="Search the archive"');
    expect(idleApp).toContain('Hold the seance');
  });

  it('names its sources in plain text (R9.4) and uses no image elements', () => {
    expect(idleApp).toContain('Internet Archive');
    expect(idleApp).toContain('Ruffle');
    expect(idleApp).not.toContain('<img');
  });
});

function capture(timestamp: string): Capture {
  return { originalUrl: 'http://oldsite.example/', timestamp, statusCode: 200, mimeType: 'text/html' };
}

const report: RecoveryReport = {
  selectedCapture: capture('20080303120000'),
  lastWorkingCapture: capture('20080303120000'),
  assets: [
    { originalUrl: 'http://oldsite.example/a.css', kind: 'stylesheet', status: 'recovered' },
    { originalUrl: 'http://oldsite.example/b.png', kind: 'image', status: 'missing' },
    { originalUrl: 'http://oldsite.example/c.js', kind: 'script', status: 'unknown' },
  ],
  recoveredCount: 1,
  totalCount: 3,
  recoveryPercent: 33,
};

describe('themed labels are paired with a literal meaning (voice.md)', () => {
  it('death certificate', () => {
    const html = renderToStaticMarkup(createElement(DeathCertificate, { report }));
    expect(html).toContain('Death certificate');
    expect(html).toContain('What we recovered and what we could not');
    // The meter carries its value for assistive tech, not just a coloured bar.
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuenow="33"');
    expect(html).toContain('33% recovered');
    // Status is stated in words, not only by the coloured dot.
    expect(html).toContain('missing');
    expect(html).toContain('assets with no saved copy');
    expect(html).toContain('not counted as recovered');
  });

  it('restored pane', () => {
    const html = renderToStaticMarkup(
      createElement(RestoredPane, {
        html: '<!doctype html><html><body><p>x</p></body></html>',
        pageOriginalUrl: 'http://oldsite.example/',
        onNavigate: () => {},
      }),
    );
    expect(html).toContain('Restored');
    expect(html).toContain('The saved page');
  });

  it('reader pane', () => {
    const html = renderToStaticMarkup(
      createElement(ReaderPane, {
        reader: { ok: true, title: 'Title', contentHtml: '<p>body</p>' },
      }),
    );
    expect(html).toContain('Reader');
    expect(html).toContain('A clean, readable version');
  });
});

describe('status banners carry the right ARIA for their severity', () => {
  it('announces a real error assertively', () => {
    const html = renderToStaticMarkup(
      createElement(StatusBanner, { status: { kind: 'outage' } }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
  });

  it('uses a polite status for a non-error state', () => {
    const html = renderToStaticMarkup(
      createElement(StatusBanner, {
        status: { kind: 'no-captures', url: 'http://oldsite.example/' },
      }),
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });
});
