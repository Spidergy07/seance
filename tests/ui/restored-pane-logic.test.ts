import { describe, it, expect } from 'vitest';
import {
  RESTORED_SANDBOX,
  buildRestoredSrcDoc,
  parseRestoredMessage,
} from '../../src/ui/restored-pane-logic.js';
import { buildArchiveUrl } from '../../src/core/archive-url.js';

describe('restored pane sandbox policy', () => {
  it('allows scripts but not same-origin or top navigation (R3.7, R9.2)', () => {
    expect(RESTORED_SANDBOX).toContain('allow-scripts');
    expect(RESTORED_SANDBOX).not.toContain('allow-same-origin');
    expect(RESTORED_SANDBOX).not.toContain('allow-top-navigation');
    expect(RESTORED_SANDBOX).not.toContain('allow-forms');
  });
});

describe('buildRestoredSrcDoc', () => {
  it('injects the click interceptor before </body>', () => {
    const out = buildRestoredSrcDoc(
      '<!doctype html><html><body><a href="x">y</a></body></html>',
    );
    expect(out).toContain('postMessage');
    expect(out).toContain('seance-restored');
    expect(out.indexOf('<script>')).toBeLessThan(out.indexOf('</body>'));
  });

  it('appends the interceptor when there is no body or html tag', () => {
    const out = buildRestoredSrcDoc('<p>fragment</p>');
    expect(out.startsWith('<p>fragment</p>')).toBe(true);
    expect(out).toContain('postMessage');
  });
});

describe('parseRestoredMessage (R3.8)', () => {
  const href = buildArchiveUrl('http://oldsite.example/page', '20080303120000', {
    raw: true,
  });

  it('returns the original URL for a well-formed navigate message', () => {
    const result = parseRestoredMessage({
      source: 'seance-restored',
      type: 'navigate',
      href,
    });
    expect(result).toEqual({
      type: 'navigate',
      originalUrl: 'http://oldsite.example/page',
    });
  });

  it('ignores messages that are not ours', () => {
    expect(parseRestoredMessage(null)).toBeNull();
    expect(parseRestoredMessage('navigate')).toBeNull();
    expect(parseRestoredMessage({ type: 'navigate', href })).toBeNull();
    expect(
      parseRestoredMessage({ source: 'seance-restored', type: 'navigate' }),
    ).toBeNull();
  });

  it('ignores an href that is not an archive URL (no live-web escape)', () => {
    expect(
      parseRestoredMessage({
        source: 'seance-restored',
        type: 'navigate',
        href: 'https://evil.example/steal',
      }),
    ).toBeNull();
  });
});
