// Task 27: keep the restored page on the restored document. The restored
// iframe went blank because a `<meta http-equiv="refresh">` navigated the
// frame away, framesets fetched dead-origin frames, and an archived `<meta>`
// CSP blocked archive assets and the interceptor. These tests run offline
// against fixture HTML (linkedom) and the pure srcdoc builder.

import { describe, it, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import redirectFrameset from '../fixtures/html/redirect-frameset.html?raw';
import { rewriteDocument } from '../../src/dom/rewrite-document.js';
import { ARCHIVE_PREFIX } from '../../src/core/archive-url.js';
import {
  buildRestoredSrcDoc,
  NAVIGATION_GUARD_SCRIPT,
} from '../../src/ui/restored-pane-logic.js';
import type { RewriteContext } from '../../src/core/url-rewriter.js';

const ctx: RewriteContext = {
  timestamp: '20080303120000',
  pageOriginalUrl: 'http://www.geocities.com/Athens/',
};

function parse(html: string): Document {
  return parseHTML(html).document as unknown as Document;
}

describe('rewriteDocument — restored-document containment (task 27)', () => {
  it('removes the meta refresh so the frame cannot navigate itself away', () => {
    const doc = parse(redirectFrameset);
    rewriteDocument(doc, ctx);

    const refresh = Array.from(doc.querySelectorAll('meta[http-equiv]')).find(
      (m) => (m.getAttribute('http-equiv') ?? '').toLowerCase() === 'refresh',
    );
    expect(refresh).toBeUndefined();
  });

  it('surfaces the refresh target as an archive-pointed link', () => {
    const doc = parse(redirectFrameset);
    rewriteDocument(doc, ctx);

    const notice = doc.querySelector('[data-seance-refresh]');
    expect(notice).not.toBeNull();
    const link = notice?.querySelector('a[href]');
    const href = link?.getAttribute('href') ?? '';
    expect(href.startsWith(ARCHIVE_PREFIX)).toBe(true);
    // It points at the refresh target, resolved against the page URL.
    expect(href).toContain('http://www.geocities.com/newhome.html');
  });

  it('removes an archived meta Content-Security-Policy', () => {
    const doc = parse(redirectFrameset);
    rewriteDocument(doc, ctx);

    const csp = Array.from(doc.querySelectorAll('meta[http-equiv]')).find(
      (m) =>
        (m.getAttribute('http-equiv') ?? '').toLowerCase() ===
        'content-security-policy',
    );
    expect(csp).toBeUndefined();
  });

  it('rewrites frameset <frame src> to the archive', () => {
    const doc = parse(redirectFrameset);
    rewriteDocument(doc, ctx);

    const frames = Array.from(doc.querySelectorAll('frame[src]'));
    expect(frames.length).toBe(2);
    for (const frame of frames) {
      expect(frame.getAttribute('src')?.startsWith(ARCHIVE_PREFIX)).toBe(true);
    }
  });
});

describe('buildRestoredSrcDoc — navigation guard (task 27)', () => {
  it('injects the navigation guard into the restored document', () => {
    const srcDoc = buildRestoredSrcDoc('<html><body><p>hi</p></body></html>');
    expect(srcDoc).toContain(NAVIGATION_GUARD_SCRIPT);
  });

  it('the guard cancels form submission and neutralises window.open', () => {
    expect(NAVIGATION_GUARD_SCRIPT).toContain('submit');
    expect(NAVIGATION_GUARD_SCRIPT).toContain('preventDefault');
    expect(NAVIGATION_GUARD_SCRIPT).toContain('window.open');
  });
});
