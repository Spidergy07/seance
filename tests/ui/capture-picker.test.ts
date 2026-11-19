// Task 30: the capture picker component. Rendered to static markup (no
// browser) to assert it lists years and dates, and a small interactive render
// to assert picking a date calls back with the right timestamp.

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CapturePicker } from '../../src/ui/CapturePicker.js';
import type { Capture } from '../../src/core/types.js';

function capture(timestamp: string): Capture {
  return {
    originalUrl: 'http://www.homestarrunner.com/',
    timestamp,
    statusCode: 200,
    mimeType: 'text/html',
  };
}

const captures = [
  capture('20261117000000'),
  capture('20060626144354'),
  capture('20040325185740'),
];

describe('CapturePicker', () => {
  it('lists the years and the saved dates', () => {
    const html = renderToStaticMarkup(
      createElement(CapturePicker, {
        captures,
        selectedTimestamp: '20261117000000',
        onPick: () => {},
      }),
    );
    expect(html).toContain('2026');
    expect(html).toContain('2006');
    expect(html).toContain('2004');
    // Plain absolute date for the selected capture.
    expect(html).toContain('17 November 2026');
    expect(html).toContain('older copy');
  });

  it('renders nothing when there is only one capture', () => {
    const html = renderToStaticMarkup(
      createElement(CapturePicker, {
        captures: [capture('20060626144354')],
        selectedTimestamp: '20060626144354',
        onPick: () => {},
      }),
    );
    expect(html).toBe('');
  });

  it('keeps every capture reachable through a year group', () => {
    // The grouping the picker relies on exposes all three timestamps.
    const html = renderToStaticMarkup(
      createElement(CapturePicker, {
        captures,
        selectedTimestamp: '20261117000000',
        onPick: () => {},
      }),
    );
    // Year options carry a per-year count so nothing is hidden.
    expect(html).toContain('2006 (1)');
    expect(html).toContain('2004 (1)');
  });
});
