import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../../src/ui/App.js';
import type { RecoveryOutcome } from '../../src/ui/types.js';

describe('App shell', () => {
  it('renders the idle screen: title, input, and the steps', () => {
    const recover = async (): Promise<RecoveryOutcome> => ({
      ok: false,
      kind: 'outage',
    });
    const html = renderToStaticMarkup(createElement(App, { recover }));

    expect(html).toContain('Seance');
    expect(html).toContain(
      'Paste the address of a site that no longer loads',
    );
    // Credits name the sources in plain text (R9.4).
    expect(html).toContain('Internet Archive');
    expect(html).toContain('Ruffle');
    // A skip link for keyboard users.
    expect(html).toContain('Skip to content');
  });
});
