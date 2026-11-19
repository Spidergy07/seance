// Attribution + privacy review (task 24, R9.1/R9.3/R9.4/R9.5). The credits area
// must name the Internet Archive and Ruffle in plain text, claim no endorsement,
// and the UI must carry no third-party logo or image. These are the automated
// guards; the code-level review (proxy persists nothing, clients call only our
// own `/api/*`) is recorded in the README and the Kiro log.

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../../src/ui/App.js';
import type { RecoveryOutcome } from '../../src/ui/types.js';

const html = renderToStaticMarkup(
  createElement(App, {
    recover: async (): Promise<RecoveryOutcome> => ({ ok: false, kind: 'outage' }),
  }),
);

describe('credits and attribution', () => {
  it('names both sources in plain text (R9.4)', () => {
    expect(html).toContain('Internet Archive Wayback Machine');
    expect(html).toContain('Ruffle');
  });

  it('claims no endorsement and uses no marks (R9.3)', () => {
    expect(html).toContain('without implying endorsement');
    expect(html).not.toContain('™');
    expect(html).not.toContain('®');
  });

  it('states the privacy posture to the visitor (R9.5)', () => {
    expect(html).toContain('saves no history');
    expect(html).toContain('stores nothing on the server');
  });

  it('carries no third-party logo or image in the UI (R9.3)', () => {
    expect(html).not.toContain('<img');
    expect(html).not.toMatch(/\.(png|jpe?g|svg|gif|webp)/i);
  });
});
