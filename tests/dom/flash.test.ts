import { describe, it, expect, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import flashHtml from '../fixtures/html/flash.html?raw';
import {
  FLASH_ERROR_MESSAGE,
  FLASH_MISSING_MESSAGE,
  FLASH_PLAYING_MESSAGE,
  detectFlashRefs,
  flashStatus,
  mountFlash,
  type RufflePlayerElement,
  type RuffleSource,
} from '../../src/dom/flash.js';
import { rewriteDocument } from '../../src/dom/rewrite-document.js';
import type { Capture } from '../../src/core/types.js';
import type { RewriteContext } from '../../src/core/url-rewriter.js';

const ctx: RewriteContext = {
  timestamp: '20080303120000',
  pageOriginalUrl: 'http://oldsite.example/',
};

function parse(html: string): Document {
  return parseHTML(html).document as unknown as Document;
}

function capture(statusCode: number): Capture {
  return {
    originalUrl: 'http://oldsite.example/flash/intro.swf',
    timestamp: '20080303120000',
    statusCode,
    mimeType: 'application/x-shockwave-flash',
  };
}

describe('detectFlashRefs', () => {
  it('finds object, embed, and anchor .swf references after rewriting', () => {
    const doc = parse(flashHtml);
    rewriteDocument(doc, ctx);
    const refs = detectFlashRefs(doc);
    const originals = refs.map((r) => r.originalUrl).sort();
    expect(originals).toEqual([
      'http://oldsite.example/download/game.swf',
      'http://oldsite.example/flash/banner.swf',
      'http://oldsite.example/flash/intro.swf',
    ]);
  });

  it('ignores non-swf object data and non-swf links', () => {
    const doc = parse(flashHtml);
    rewriteDocument(doc, ctx);
    const refs = detectFlashRefs(doc);
    expect(refs.some((r) => r.originalUrl.endsWith('.mp4'))).toBe(false);
    expect(refs.some((r) => r.originalUrl.endsWith('about.html'))).toBe(false);
  });

  it('detects a plain (un-rewritten) absolute .swf reference', () => {
    const doc = parse(
      '<html><body><embed src="http://site.example/a.swf"></body></html>',
    );
    const refs = detectFlashRefs(doc);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.originalUrl).toBe('http://site.example/a.swf');
  });
});

describe('flashStatus', () => {
  it('recovers a 200 capture and marks everything else missing', () => {
    expect(flashStatus(capture(200))).toBe('recovered');
    expect(flashStatus(capture(404))).toBe('missing');
    expect(flashStatus(null)).toBe('missing');
  });
});

describe('mountFlash', () => {
  function fakeRuffle(doc: Document): {
    source: RuffleSource;
    load: ReturnType<typeof vi.fn>;
  } {
    const load = vi.fn(() => Promise.resolve());
    const source: RuffleSource = {
      createPlayer: () => {
        const el = doc.createElement('div') as unknown as RufflePlayerElement;
        (el as unknown as { load: unknown }).load = load;
        return el;
      },
    };
    return { source, load };
  }

  it('mounts a Ruffle player for a recovered .swf', async () => {
    const doc = parse('<html><body><embed src="x"></body></html>');
    const target = doc.querySelector('embed')!;
    const { source, load } = fakeRuffle(doc);
    const archiveUrl = 'https://web.archive.org/web/20080303120000id_/http://s/a.swf';

    const outcome = await mountFlash(
      target,
      { status: 'recovered', archiveUrl },
      { doc, loadRuffle: () => Promise.resolve(source) },
    );

    expect(outcome).toBe('playing');
    expect(load).toHaveBeenCalledWith({ url: archiveUrl });
    const mounted = doc.querySelector('[data-seance-flash="playing"]');
    expect(mounted?.textContent).toContain(FLASH_PLAYING_MESSAGE);
    expect(doc.querySelector('embed')).toBeNull();
  });

  it('shows a plain notice for a missing .swf and never loads Ruffle', async () => {
    const doc = parse('<html><body><embed src="x"></body></html>');
    const target = doc.querySelector('embed')!;
    const loadRuffle = vi.fn();

    const outcome = await mountFlash(
      target,
      { status: 'missing' },
      { doc, loadRuffle: loadRuffle as never },
    );

    expect(outcome).toBe('missing');
    expect(loadRuffle).not.toHaveBeenCalled();
    const notice = doc.querySelector('[data-seance-flash="missing"]');
    expect(notice?.textContent).toBe(FLASH_MISSING_MESSAGE);
  });

  it('shows a plain error if Ruffle fails to load, without throwing', async () => {
    const doc = parse('<html><body><object data="x"></object></body></html>');
    const target = doc.querySelector('object')!;

    const outcome = await mountFlash(
      target,
      { status: 'recovered', archiveUrl: 'https://web.archive.org/web/20080303120000id_/http://s/a.swf' },
      {
        doc,
        loadRuffle: () => Promise.reject(new Error('wasm blocked')),
      },
    );

    expect(outcome).toBe('error');
    const notice = doc.querySelector('[data-seance-flash="error"]');
    expect(notice?.textContent).toBe(FLASH_ERROR_MESSAGE);
    // The original element is gone, but the document still renders.
    expect(doc.querySelector('object')).toBeNull();
  });

  it('shows the error notice if the player load throws after mounting', async () => {
    const doc = parse('<html><body><embed src="x"></body></html>');
    const target = doc.querySelector('embed')!;
    const source: RuffleSource = {
      createPlayer: () => {
        const el = doc.createElement('div') as unknown as RufflePlayerElement;
        (el as unknown as { load: () => Promise<void> }).load = () =>
          Promise.reject(new Error('init failed'));
        return el;
      },
    };

    const outcome = await mountFlash(
      target,
      { status: 'recovered', archiveUrl: 'https://web.archive.org/web/20080303120000id_/http://s/a.swf' },
      { doc, loadRuffle: () => Promise.resolve(source) },
    );

    expect(outcome).toBe('error');
    expect(doc.querySelector('[data-seance-flash="error"]')?.textContent).toBe(
      FLASH_ERROR_MESSAGE,
    );
    expect(doc.querySelector('[data-seance-flash="playing"]')).toBeNull();
  });
});
