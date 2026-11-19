// Task 54: the reader view renders sanitised Readability output in the app's
// own DOM, not the sandboxed iframe, so the restored view's injected image
// guard does not reach it. `guardReaderImages` applies the same policy directly
// over the reader's images: hide zero-content tracking pixels (1×1 / 0×0) and
// replace an image that fails to load with a small styled placeholder instead
// of the browser's broken-image icon (R3.13, R7.4). Runs under linkedom.

import { describe, it, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import {
  guardReaderImages,
  READER_IMAGE_PLACEHOLDER_TEXT,
} from '../../src/dom/reader-image-guard.js';

function make(body: string): { document: Document; Event: typeof Event } {
  const dom = parseHTML(`<!doctype html><html><body>${body}</body></html>`);
  return {
    document: dom.document as unknown as Document,
    Event: dom.Event as unknown as typeof Event,
  };
}

describe('guardReaderImages (task 54)', () => {
  it('hides a declared 1×1 tracking pixel', () => {
    const { document } = make('<img id="pix" src="x" width="1" height="1">');
    guardReaderImages(document.body);
    const img = document.getElementById('pix') as HTMLElement;
    expect(img.getAttribute('data-seance-img')).toBe('tracking');
    expect(img.style.display).toBe('none');
  });

  it('hides a declared 0×0 tracking pixel', () => {
    const { document } = make('<img id="pix" src="x" width="0" height="0">');
    guardReaderImages(document.body);
    expect(document.getElementById('pix')?.getAttribute('data-seance-img')).toBe(
      'tracking',
    );
  });

  it('replaces an image that fails to load with a plain placeholder', () => {
    const { document, Event } = make(
      '<p><img id="broke" src="https://web.archive.org/web/20051230id_/http://x/privacy.gif"></p>',
    );
    guardReaderImages(document.body);
    const img = document.getElementById('broke') as HTMLElement;
    img.dispatchEvent(new Event('error'));
    // The broken image is gone; a placeholder carries the plain text instead of
    // the browser's broken-image icon.
    expect(document.getElementById('broke')).toBeNull();
    const placeholder = document.querySelector('[data-seance-img="missing"]');
    expect(placeholder).not.toBeNull();
    expect(placeholder?.textContent).toBe(READER_IMAGE_PLACEHOLDER_TEXT);
  });

  it('leaves a normal sized image untouched', () => {
    const { document } = make(
      '<img id="ok" src="https://web.archive.org/logo.png" width="200" height="80">',
    );
    guardReaderImages(document.body);
    const img = document.getElementById('ok') as HTMLElement;
    expect(img.getAttribute('data-seance-img')).toBeNull();
    expect(img.style.display).not.toBe('none');
  });

  it('is idempotent: a second pass does not double-process', () => {
    const { document } = make('<img id="pix" src="x" width="1" height="1">');
    guardReaderImages(document.body);
    guardReaderImages(document.body);
    expect(document.querySelectorAll('[data-seance-img]').length).toBe(1);
  });
});
