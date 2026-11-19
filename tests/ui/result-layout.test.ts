// Task 44: when readability finds no article, the reader note collapses and the
// restored view takes the full pane width, rather than leaving an empty
// half-width card. The layout choice is a pure function of whether an article
// was found, plus a CSS rule that makes the "solo" container one full-width
// column. Both are asserted here. See requirements R7.3 and design.md §10.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resultPanesClass } from '../../src/ui/result-layout.js';

const css = readFileSync('src/ui/theme.css', 'utf8');

/** Pull a CSS rule body by exact selector. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (match === null) {
    throw new Error(`rule not found: ${selector}`);
  }
  return match[1] as string;
}

describe('resultPanesClass (task 44, R7.3)', () => {
  it('uses the two-pane container when an article was found', () => {
    expect(resultPanesClass(true)).toBe('panes');
  });

  it('switches the container to the full-width solo layout with no article', () => {
    expect(resultPanesClass(false)).toBe('panes panes--solo');
  });
});

describe('panes--solo layout (task 44)', () => {
  it('is a single full-width column, overriding the two-column breakpoint', () => {
    const solo = ruleBody('.panes--solo');
    expect(solo).toMatch(/grid-template-columns:\s*1fr\s*;/);
    // It must come after the wide-screen two-column rule so it wins the cascade.
    expect(css.indexOf('.panes--solo')).toBeGreaterThan(
      css.indexOf('grid-template-columns: 1fr 1fr'),
    );
  });
});
