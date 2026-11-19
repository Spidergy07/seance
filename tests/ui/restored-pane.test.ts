import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RestoredPane } from '../../src/ui/RestoredPane.js';

describe('RestoredPane', () => {
  const html = renderToStaticMarkup(
    createElement(RestoredPane, {
      html: '<!doctype html><html><body><p>old page</p></body></html>',
      pageOriginalUrl: 'http://oldsite.example/',
      onNavigate: () => {},
    }),
  );

  it('renders a sandboxed iframe (R3.7, R9.2)', () => {
    expect(html).toContain('<iframe');
    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).not.toContain('allow-same-origin');
  });

  it('carries the archived document in srcdoc with the interceptor', () => {
    expect(html.toLowerCase()).toContain('srcdoc=');
    expect(html).toContain('old page');
    expect(html).toContain('seance-restored');
  });

  it('gives the iframe an accessible title and a no-referrer policy', () => {
    expect(html).toContain('title="Restored page for http://oldsite.example/"');
    expect(html.toLowerCase()).toContain('referrerpolicy="no-referrer"');
  });

  it('labels the pane "Restored" with its literal meaning (voice.md)', () => {
    expect(html).toContain('Restored');
    expect(html).toContain('the saved page');
  });
});
