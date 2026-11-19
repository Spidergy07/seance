import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DeathCertificate } from '../../src/ui/DeathCertificate.js';
import type { Capture, RecoveryReport } from '../../src/core/types.js';

const capture = (timestamp: string): Capture => ({
  originalUrl: 'http://oldsite.example/',
  timestamp,
  statusCode: 200,
  mimeType: 'text/html',
});

const baseReport: RecoveryReport = {
  selectedCapture: capture('20080303120000'),
  lastWorkingCapture: capture('20080303120000'),
  assets: [
    { originalUrl: 'http://oldsite.example/a.css', kind: 'stylesheet', status: 'recovered', archiveUrl: 'x' },
    { originalUrl: 'http://oldsite.example/b.jpg', kind: 'image', status: 'recovered', archiveUrl: 'x' },
    { originalUrl: 'http://oldsite.example/c.jpg', kind: 'image', status: 'missing' },
    { originalUrl: 'http://oldsite.example/d.js', kind: 'script', status: 'unknown' },
  ],
  recoveredCount: 2,
  totalCount: 4,
  recoveryPercent: 50,
};

function render(report: RecoveryReport): string {
  return renderToStaticMarkup(createElement(DeathCertificate, { report }));
}

describe('DeathCertificate', () => {
  it('shows the last working capture date in plain language (R5.1)', () => {
    const html = render(baseReport);
    expect(html).toContain('3 March 2008');
    expect(html).toContain('last working capture');
  });

  it('shows the recovery percent as a number and a meter (R5.2, R4.3)', () => {
    const html = render(baseReport);
    expect(html).toContain('50%');
    expect(html).toContain('2 of 4 assets recovered');
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuenow="50"');
  });

  it('counts missing assets and links to the list (R5.3)', () => {
    const html = render(baseReport);
    expect(html).toContain('1 missing');
    expect(html).toContain('href="#missing-spirits"');
    expect(html).toContain('id="missing-spirits"');
    // The missing image URL appears in the grouped list.
    expect(html).toContain('http://oldsite.example/c.jpg');
  });

  it('reports unknown assets separately and never as recovered (R4.4)', () => {
    const html = render(baseReport);
    expect(html).toContain('1 unknown');
    expect(html).toContain('not counted as recovered');
  });

  it('notes the selected capture when it differs from the last working one (R5.4)', () => {
    const html = render({
      ...baseReport,
      selectedCapture: capture('20050101000000'),
    });
    expect(html).toContain('Showing the capture from');
    expect(html).toContain('1 January 2005');
  });

  it('states plainly when there is no working capture', () => {
    const html = render({ ...baseReport, lastWorkingCapture: null });
    expect(html).toContain('No working capture found');
  });

  it('shows a clean certificate when every asset was recovered', () => {
    const html = render({
      selectedCapture: capture('20080303120000'),
      lastWorkingCapture: capture('20080303120000'),
      assets: [],
      recoveredCount: 0,
      totalCount: 0,
      recoveryPercent: 100,
    });
    expect(html).toContain('100%');
    expect(html).toContain('0 missing');
    expect(html).not.toContain('id="missing-spirits"');
  });
});

describe('DeathCertificate — recently-alive state (task 29)', () => {
  // Fixed reference "now": 19 November 2026.
  const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);

  function renderAt(report: RecoveryReport, now: number): string {
    return renderToStaticMarkup(
      createElement(DeathCertificate, { report, now }),
    );
  }

  it('does not claim a death when the last capture is within 30 days', () => {
    const recent = capture('20261117000000'); // two days before NOW
    const html = renderAt(
      { ...baseReport, selectedCapture: recent, lastWorkingCapture: recent },
      NOW,
    );
    expect(html).toContain('Still answering recently');
    expect(html).toContain('Last saved copy');
    expect(html).toContain('17 November 2026');
    // It must not present this as a death.
    expect(html).not.toContain('Died on');
    // It suggests picking an older capture.
    expect(html).toContain('older capture');
  });

  it('still shows a death date for an old capture', () => {
    const html = renderAt(baseReport, NOW); // 3 March 2008
    expect(html).toContain('Died on');
    expect(html).toContain('3 March 2008');
    expect(html).not.toContain('Still answering recently');
  });
});
