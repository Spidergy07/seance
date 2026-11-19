import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RUFFLE_SRC,
  RESTORED_SANDBOX,
  RESTORED_IMAGE_PLACEHOLDER_TEXT,
  buildRestoredSrcDoc,
  parseRestoredMessage,
} from '../../src/ui/restored-pane-logic.js';
import { FLASH_ERROR_MESSAGE } from '../../src/dom/flash.js';
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

  it('does not load Ruffle unless a script URL is given', () => {
    const out = buildRestoredSrcDoc(
      '<!doctype html><html><head></head><body></body></html>',
    );
    expect(out).not.toContain('ruffle');
  });

  it('injects the Ruffle loader into the head when a URL is given (R6.1)', () => {
    const out = buildRestoredSrcDoc(
      '<!doctype html><html><head><title>t</title></head><body><object data="x"></object></body></html>',
      { ruffleScriptUrl: DEFAULT_RUFFLE_SRC },
    );
    expect(out).toContain(`<script src="${DEFAULT_RUFFLE_SRC}"></script>`);
    // Ruffle loads before the body it polyfills, and before the interceptor.
    expect(out.indexOf(DEFAULT_RUFFLE_SRC)).toBeLessThan(out.indexOf('</head>'));
    expect(out).toContain('seance-restored');
  });

  it('configures Ruffle to suppress its warning UI, before the loader (R6.7)', () => {
    const out = buildRestoredSrcDoc(
      '<!doctype html><html><head></head><body><object data="x"></object></body></html>',
      { ruffleScriptUrl: DEFAULT_RUFFLE_SRC },
    );
    expect(out).toContain('RufflePlayer.config');
    expect(out).toContain('warnOnUnsupportedContent');
    // The config must be set before the Ruffle script reads it.
    expect(out.indexOf('RufflePlayer.config')).toBeLessThan(
      out.indexOf(DEFAULT_RUFFLE_SRC),
    );
  });

  it('degrades a failed Flash embed to the plain notice (R6.7, R6.5)', () => {
    const out = buildRestoredSrcDoc(
      '<!doctype html><html><head></head><body><object data="x"></object></body></html>',
      { ruffleScriptUrl: DEFAULT_RUFFLE_SRC },
    );
    // An error handler is installed and it uses the plain voice.md notice text.
    expect(out).toContain('addEventListener("error"');
    expect(out).toContain(FLASH_ERROR_MESSAGE);
  });

  it('does not inject the Ruffle config when there is no Flash', () => {
    const out = buildRestoredSrcDoc(
      '<!doctype html><html><head></head><body></body></html>',
    );
    expect(out).not.toContain('RufflePlayer.config');
    expect(out).not.toContain(FLASH_ERROR_MESSAGE);
  });

  it('injects an image guard that hides tracking pixels and replaces broken images (R3.13)', () => {
    const out = buildRestoredSrcDoc(
      '<!doctype html><html><head></head><body><img src="x"></body></html>',
    );
    // Hides 1x1 / 0x0 tracking pixels: it inspects the natural size.
    expect(out).toContain('naturalWidth');
    // Replaces a failed image with the plain placeholder (not the broken icon).
    expect(out).toContain('addEventListener("error"');
    expect(out).toContain('data-seance-img');
    expect(out).toContain(RESTORED_IMAGE_PLACEHOLDER_TEXT);
  });

  it('injects the image guard even for a page with no Flash', () => {
    const out = buildRestoredSrcDoc('<p>fragment</p>');
    expect(out.startsWith('<p>fragment</p>')).toBe(true);
    expect(out).toContain(RESTORED_IMAGE_PLACEHOLDER_TEXT);
    // The guard carries no Ruffle anything.
    expect(out).not.toContain('ruffle');
  });

  it('injects a fit-to-width script that scales a wide page down to the pane (R3.12)', () => {
    const out = buildRestoredSrcDoc(
      '<!doctype html><html><head></head><body><table width="800"></table></body></html>',
    );
    // Measures the document width against the frame width.
    expect(out).toContain('scrollWidth');
    // Re-measures on resize.
    expect(out).toContain('addEventListener("resize"');
    // Applies a CSS transform scale (keeps Flash interactive; not `zoom`).
    expect(out).toContain('scale(');
    // Only ever scales down, never enlarges.
    expect(out).toContain('Math.min(1');
  });

  it('re-fits after Ruffle mounts by observing DOM changes (task 43, R3.12)', () => {
    // Ruffle replaces the Flash embed with its own player element at the
    // movie's natural width after the first fit ran, so the page overflows
    // again. The fit script must re-measure when the document's child nodes
    // change, not only on load and resize.
    const out = buildRestoredSrcDoc(
      '<!doctype html><html><head></head><body><object data="x.swf"></object></body></html>',
      { ruffleScriptUrl: DEFAULT_RUFFLE_SRC },
    );
    expect(out).toContain('MutationObserver');
    expect(out).toContain('childList');
  });

  it('styles the injected notices so they are not default serif text (R3.14)', () => {
    const out = buildRestoredSrcDoc(
      '<!doctype html><html><head></head><body></body></html>',
    );
    expect(out).toContain('<style');
    // Rules for every notice Seance injects.
    expect(out).toContain('[data-seance-refresh]');
    expect(out).toContain('[data-seance-flash]');
    expect(out).toContain('[data-seance-img]');
    // Self-contained: its own background and font, so it reads on any page.
    expect(out).toContain('background');
    expect(out).toContain('font-family');
    // The style lives in the head when there is one.
    expect(out.indexOf('<style')).toBeLessThan(out.indexOf('</head>'));
  });

  it('sets Ruffle base to the page archive prefix so relative loads resolve (R6.8)', () => {
    const base = buildArchiveUrl('http://kids.msfc.nasa.gov/', '20051230162224', {
      raw: true,
    });
    const out = buildRestoredSrcDoc(
      '<!doctype html><html><head></head><body><object data="x.swf"></object></body></html>',
      { ruffleScriptUrl: DEFAULT_RUFFLE_SRC, pageArchiveBase: base },
    );
    expect(out).toContain('base:');
    expect(out).toContain(base);
    // The base rides in the Ruffle config, read before the loader runs.
    expect(out.indexOf('base:')).toBeLessThan(out.indexOf(DEFAULT_RUFFLE_SRC));
  });

  it('gives a Flash page a resolvable stage height so a 90% stage does not collapse (R6.8)', () => {
    const out = buildRestoredSrcDoc(
      '<!doctype html><html><head></head><body><object data="x.swf" width="90%" height="90%"></object></body></html>',
      { ruffleScriptUrl: DEFAULT_RUFFLE_SRC },
    );
    // A definite ancestor height lets the percentage stage resolve.
    expect(out).toContain('html,body{height:100%}');
    // The stage rule lives in the head when there is one.
    expect(out.indexOf('html,body{height:100%}')).toBeLessThan(
      out.indexOf('</head>'),
    );
  });

  it('does not add the Flash stage height rule to a page with no Flash', () => {
    const out = buildRestoredSrcDoc(
      '<!doctype html><html><head></head><body><p>hi</p></body></html>',
    );
    expect(out).not.toContain('html,body{height:100%}');
    expect(out).not.toContain('base:');
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
