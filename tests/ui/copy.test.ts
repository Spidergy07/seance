import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DeathCertificate } from '../../src/ui/DeathCertificate.js';
import { ReaderPane } from '../../src/ui/ReaderPane.js';
import { RestoredPane } from '../../src/ui/RestoredPane.js';
import { CapturePicker } from '../../src/ui/CapturePicker.js';
import type { Capture, RecoveryReport } from '../../src/core/types.js';
import type { ReaderResult } from '../../src/dom/reader.js';

// Copy polish (task 42, voice.md): every section pairs a themed heading with a
// plain literal subtitle on its own line, not an em-dash clause tacked onto the
// heading. No rendered panel should carry an em dash.

const capture = (timestamp: string): Capture => ({
  originalUrl: 'http://oldsite.example/',
  timestamp,
  statusCode: 200,
  mimeType: 'text/html',
});

const report: RecoveryReport = {
  selectedCapture: capture('20080303120000'),
  lastWorkingCapture: capture('20080303120000'),
  assets: [
    { originalUrl: 'http://oldsite.example/a.css', kind: 'stylesheet', status: 'recovered', archiveUrl: 'x' },
    { originalUrl: 'http://oldsite.example/c.jpg', kind: 'image', status: 'missing' },
  ],
  recoveredCount: 1,
  totalCount: 2,
  recoveryPercent: 50,
};

const reader: ReaderResult = {
  ok: true,
  title: 'A page',
  contentHtml: '<p>text</p>',
};

describe('UI copy (task 42, voice.md)', () => {
  it('death certificate: themed heading + literal subtitle, no em dash', () => {
    const html = renderToStaticMarkup(
      // A far-future clock keeps the "died on" path (not recently alive).
      createElement(DeathCertificate, { report, now: Date.parse('2026-01-01') }),
    );
    expect(html).toContain('Death certificate');
    expect(html).toContain('What we recovered and what we could not');
    expect(html).not.toContain('—');
  });

  it('reader pane: themed heading + literal subtitle, no em dash', () => {
    const html = renderToStaticMarkup(createElement(ReaderPane, { reader }));
    expect(html).toContain('Reader');
    expect(html).toContain('A clean, readable version');
    expect(html).not.toContain('—');
  });

  it('restored pane: themed heading + literal subtitle, no em dash', () => {
    const html = renderToStaticMarkup(
      createElement(RestoredPane, {
        html: '<!doctype html><html><body><p>x</p></body></html>',
        pageOriginalUrl: 'http://oldsite.example/',
        onNavigate: () => {},
      }),
    );
    expect(html).toContain('Restored');
    expect(html).toContain('The saved page');
    // The iframe srcdoc is HTML-escaped in the attribute, so any em dash would
    // be in our own chrome. There is none.
    expect(html).not.toContain('—');
  });

  it('capture picker: themed heading + literal subtitle, no em dash', () => {
    const html = renderToStaticMarkup(
      createElement(CapturePicker, {
        captures: [capture('20080303120000'), capture('20060101120000')],
        selectedTimestamp: '20080303120000',
        onPick: () => {},
      }),
    );
    expect(html).toContain('Reach an older copy');
    expect(html).toContain('Pick a saved date to open');
    expect(html).not.toContain('—');
  });
});
