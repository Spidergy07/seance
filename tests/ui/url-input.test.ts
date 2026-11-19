import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UrlInput } from '../../src/ui/UrlInput.js';

function render(props: Parameters<typeof UrlInput>[0]): string {
  return renderToStaticMarkup(createElement(UrlInput, props));
}

describe('UrlInput', () => {
  const noop = () => {};

  it('shows the placeholder and the submit label when idle', () => {
    const html = render({ busy: false, onSubmit: noop });
    expect(html).toContain(
      'Paste the address of a site that no longer loads',
    );
    expect(html).toContain('Hold the seance');
    expect(html).toContain('aria-label="Search the archive"');
  });

  it('disables the control and shows it is busy while running (R1.4)', () => {
    const html = render({ busy: true, onSubmit: noop });
    expect(html).toContain('Holding the seance');
    // Both the field and the button are disabled.
    const disabledCount = html.split('disabled').length - 1;
    expect(disabledCount).toBeGreaterThanOrEqual(2);
  });

  it('surfaces the interpreted https:// URL before searching (R1.3)', () => {
    const html = render({
      busy: false,
      onSubmit: noop,
      initialValue: 'example.com/page',
    });
    expect(html).toContain('https://example.com/page');
    expect(html).toContain('Seance will search for');
  });

  it('disables submit when there is no resolvable URL', () => {
    const html = render({ busy: false, onSubmit: noop, initialValue: '' });
    // The submit button is disabled because the field is empty.
    expect(html).toMatch(/<button[^>]*disabled/);
  });
});
