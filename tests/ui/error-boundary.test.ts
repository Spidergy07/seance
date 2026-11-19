// Task 37: the error boundary around the result panels. If any panel throws
// during render, Seance shows a plain voice.md message with a retry control,
// not a blank page (R5.5).

import { describe, it, expect, vi } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ResultErrorBoundary,
  ResultErrorFallback,
} from '../../src/ui/ResultErrorBoundary.js';

describe('ResultErrorFallback', () => {
  it('shows a plain message and a retry control (voice.md)', () => {
    const html = renderToStaticMarkup(
      createElement(ResultErrorFallback, { onRetry: () => {} }),
    );
    // Plain English, names what happened, no blame on the user.
    expect(html.toLowerCase()).toContain('could not');
    expect(html).toContain('Try again');
    // A real control, not just text.
    expect(html).toContain('<button');
  });
});

describe('ResultErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    const html = renderToStaticMarkup(
      createElement(
        ResultErrorBoundary,
        { onRetry: () => {} },
        createElement('p', null, 'the panels'),
      ),
    );
    expect(html).toContain('the panels');
    expect(html).not.toContain('Try again');
  });

  it('derives the error state from a thrown error', () => {
    // React calls this static to switch to the fallback when a child throws.
    expect(ResultErrorBoundary.getDerivedStateFromError()).toEqual({
      hasError: true,
    });
  });

  it('renders the fallback with the retry handler once in the error state', () => {
    const onRetry = vi.fn();
    const boundary = new ResultErrorBoundary({ onRetry });
    boundary.state = { hasError: true };
    const html = renderToStaticMarkup(boundary.render() as ReactElement);
    expect(html).toContain('Try again');
    expect(html.toLowerCase()).toContain('could not');
  });
});
