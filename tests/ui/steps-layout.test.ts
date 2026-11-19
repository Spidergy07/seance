// Task 31: the "how it works" step number must never overlap the step text.
// Layout cannot be measured without a browser, but the overlap is a direct
// consequence of the list item's left padding being smaller than the numbered
// circle's extent. This guard parses theme.css and asserts the text clears the
// circle, so the regression cannot come back unnoticed.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Read the stylesheet from disk. Vitest stubs `*.css` imports to empty, so we
// read the file directly (relative to the project root, where vitest runs).
const css = readFileSync('src/ui/theme.css', 'utf8');

/** Map of spacing tokens (`--s-4`) to their rem value, parsed from :root. */
function spacingScale(): Map<string, number> {
  const scale = new Map<string, number>();
  for (const match of css.matchAll(/(--s-\d+):\s*([\d.]+)rem/g)) {
    scale.set(match[1] as string, Number.parseFloat(match[2] as string));
  }
  return scale;
}

const scale = spacingScale();

/** Resolve a single length token — `var(--s-6)` or `1.4rem` — to rem. */
function toRem(token: string): number {
  const varMatch = /var\((--s-\d+)\)/.exec(token);
  if (varMatch) {
    const value = scale.get(varMatch[1] as string);
    if (value === undefined) {
      throw new Error(`unknown spacing token ${varMatch[1]}`);
    }
    return value;
  }
  const remMatch = /([\d.]+)rem/.exec(token);
  if (remMatch) {
    return Number.parseFloat(remMatch[1] as string);
  }
  throw new Error(`cannot resolve length: ${token}`);
}

/** Pull a CSS rule body by exact selector. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`);
  const match = re.exec(css);
  if (match === null) {
    throw new Error(`rule not found: ${selector}`);
  }
  return match[1] as string;
}

describe('how-it-works steps layout (task 31)', () => {
  it('gives the step text enough left padding to clear the number circle', () => {
    const li = ruleBody('.steps li');
    const before = ruleBody('.steps li::before');

    // padding shorthand: top right bottom left → the 4th token is padding-left.
    const padding = /padding:\s*([^;]+);/.exec(li);
    expect(padding).not.toBeNull();
    const tokens = (padding?.[1] ?? '').trim().split(/\s+/);
    expect(tokens.length).toBe(4);
    const paddingLeft = toRem(tokens[3] as string);

    const left = toRem((/left:\s*([^;]+);/.exec(before)?.[1] ?? '').trim());
    const width = toRem((/width:\s*([^;]+);/.exec(before)?.[1] ?? '').trim());

    // The circle spans [left, left + width]. Text starts at paddingLeft, which
    // must sit at or past the circle's right edge so they never overlap.
    expect(paddingLeft).toBeGreaterThanOrEqual(left + width);
  });
});
