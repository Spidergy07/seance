import { describe, it, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import fc from 'fast-check';

// This file only proves the test environment works:
//  - vitest runs under Node,
//  - linkedom gives us a DOM without a browser,
//  - fast-check runs property tests.
// It is deleted once real tests exist for the same ground; see tasks.md task 2.

describe('test environment', () => {
  it('runs vitest under Node', () => {
    expect(1 + 1).toBe(2);
  });

  it('parses HTML with linkedom (DOM shim)', () => {
    const { document } = parseHTML(
      '<!doctype html><html><body><a href="/page">link</a></body></html>',
    );
    const anchor = document.querySelector('a');
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('href')).toBe('/page');
    expect(anchor?.textContent).toBe('link');
  });

  it('runs a fast-check property', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        expect(a + b).toBe(b + a);
      }),
    );
  });
});
