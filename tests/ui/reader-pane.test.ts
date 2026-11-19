import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReaderPane } from '../../src/ui/ReaderPane.js';
import type { ReaderResult } from '../../src/dom/reader.js';

function render(reader: ReaderResult): string {
  return renderToStaticMarkup(createElement(ReaderPane, { reader }));
}

describe('ReaderPane', () => {
  it('renders the article title and body when an article was found', () => {
    const html = render({
      ok: true,
      title: 'An Old Essay',
      contentHtml: '<p>The text that survived.</p>',
    });
    expect(html).toContain('An Old Essay');
    expect(html).toContain('The text that survived.');
    expect(html).toContain('Reader');
    expect(html).toContain('a clean, readable version');
  });

  it('omits an empty title but still renders the body', () => {
    const html = render({ ok: true, title: '', contentHtml: '<p>Body only.</p>' });
    expect(html).toContain('Body only.');
    expect(html).not.toContain('<h3');
  });

  it('shows the plain no-article notice and keeps the restored page (R7.3)', () => {
    const html = render({ ok: false, reason: 'no-article' });
    expect(html).toContain('No readable article');
    expect(html).toContain('The restored page is still shown');
  });
});
