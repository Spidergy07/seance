// Flash detection and Ruffle mounting. Finds archived `.swf` references and,
// for those that were recovered, mounts a Ruffle player pointed at the archived
// raw `.swf`. Missing Flash gets a plain notice; a Ruffle load/init failure
// gets a plain error and never breaks the rest of the page. See design.md §9
// and requirements R6.1–R6.5.
//
// Ruffle itself is loaded through an injectable factory, so tests exercise the
// mount logic without loading WebAssembly. The real factory (browser only)
// loads Ruffle from its official distribution.

import { parseArchiveUrl } from '../core/archive-url.js';
import type { AssetStatus, Capture } from '../core/types.js';

// Plain-language messages (voice.md). Each themed idea has a literal meaning.
export const FLASH_PLAYING_MESSAGE =
  'This page contains Flash. Playing it with Ruffle.';
export const FLASH_MISSING_MESSAGE =
  'This page referenced a Flash file, but no copy was saved. It cannot be played.';
export const FLASH_ERROR_MESSAGE =
  'This page contains Flash, but the Ruffle player could not start. The rest of the page is shown.';

/** A Flash reference found in the archived document. */
export interface FlashRef {
  element: Element;
  /** The absolute original `.swf` URL, for capture lookup. */
  originalUrl: string;
}

/** True when a URL's path ends in `.swf`. */
function endsWithSwf(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.swf');
  } catch {
    return url.toLowerCase().split('?')[0]?.endsWith('.swf') ?? false;
  }
}

/**
 * Recover the original `.swf` URL from an attribute value, which may already be
 * an archive URL (after document rewriting) or a plain URL. Returns null when
 * the reference is not a `.swf`.
 */
function swfOriginal(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const parsed = parseArchiveUrl(trimmed);
  const candidate = parsed ? parsed.originalUrl : trimmed;
  return endsWithSwf(candidate) ? candidate : null;
}

/**
 * Find every `.swf` reference: `<object data>`, `<embed src>`, and bare
 * `<a href>` links. Works whether or not the document has been rewritten.
 */
export function detectFlashRefs(doc: Document): FlashRef[] {
  const refs: FlashRef[] = [];
  const sources: Array<{ selector: string; attr: string }> = [
    { selector: 'object[data]', attr: 'data' },
    { selector: 'embed[src]', attr: 'src' },
    { selector: 'a[href]', attr: 'href' },
  ];
  for (const { selector, attr } of sources) {
    for (const element of Array.from(doc.querySelectorAll(selector))) {
      const value = element.getAttribute(attr);
      if (value === null) {
        continue;
      }
      const originalUrl = swfOriginal(value);
      if (originalUrl !== null) {
        refs.push({ element, originalUrl });
      }
    }
  }
  return refs;
}

/** Map a capture to a Flash status: a 200 capture plays, anything else is missing. */
export function flashStatus(capture: Capture | null): 'recovered' | 'missing' {
  return capture !== null && capture.statusCode === 200 ? 'recovered' : 'missing';
}

/** A Ruffle player element: a DOM element that can load a `.swf` by URL. */
export interface RufflePlayerElement extends Element {
  load(config: { url: string }): void | Promise<void>;
}

/** The Ruffle entry point: makes a fresh player element. */
export interface RuffleSource {
  createPlayer: () => RufflePlayerElement;
}

/** Loads Ruffle (once) and resolves its player factory. Injected for tests. */
export type RuffleFactory = () => Promise<RuffleSource>;

export interface MountFlashOptions {
  status: 'recovered' | 'missing';
  /** The raw archive URL of the `.swf`; required when `status` is 'recovered'. */
  archiveUrl?: string;
}

export interface FlashDeps {
  doc: Document;
  loadRuffle: RuffleFactory;
}

export type FlashOutcome = 'playing' | 'missing' | 'error';

function noticeElement(
  doc: Document,
  state: FlashOutcome,
  message: string,
): Element {
  const notice = doc.createElement('div');
  notice.setAttribute('data-seance-flash', state);
  notice.setAttribute('role', 'note');
  const text = doc.createElement('p');
  text.textContent = message;
  notice.appendChild(text);
  return notice;
}

function replaceElement(oldEl: Element, newEl: Element): void {
  oldEl.parentNode?.replaceChild(newEl, oldEl);
}

/** How the restored document's Flash embeds were handled before serialising. */
export interface FlashAccounting {
  /** Embeds left in place for Ruffle to attempt (recovered or undetermined). */
  playable: number;
  /** Embeds replaced with the plain "not saved" notice (confirmed missing). */
  missing: number;
}

/**
 * Apply Flash outcomes to the restored document before it is serialised into
 * the sandboxed iframe. `<object>`/`<embed>` `.swf` references with a
 * confirmed-missing capture are replaced with the plain "not saved" notice
 * (R6.3). Recovered and undetermined references are left in place so Ruffle,
 * loaded inside the iframe, can attempt to play the archived `.swf` (R6.1,
 * R6.2). Bare `<a>` links to `.swf` are navigation, not embeds, so they are
 * left for the restored pane's click interceptor and not touched here.
 *
 * This runs in the recovery pipeline (no Ruffle present), so it never loads
 * WebAssembly; the actual player is mounted by Ruffle inside the iframe.
 */
export function applyFlashNotices(
  doc: Document,
  statusOf: (originalUrl: string) => AssetStatus,
): FlashAccounting {
  let playable = 0;
  let missing = 0;
  for (const ref of detectFlashRefs(doc)) {
    const tag = ref.element.tagName.toLowerCase();
    if (tag !== 'object' && tag !== 'embed') {
      continue; // anchors are navigation, handled by the click interceptor
    }
    if (statusOf(ref.originalUrl) === 'missing') {
      replaceElement(
        ref.element,
        noticeElement(doc, 'missing', FLASH_MISSING_MESSAGE),
      );
      missing += 1;
    } else {
      playable += 1;
    }
  }
  return { playable, missing };
}

/**
 * Replace a Flash reference in the DOM with its outcome:
 * - missing → a plain "not saved" notice (R6.3);
 * - recovered → a Ruffle player loaded with the archived `.swf` (R6.1, R6.2);
 * - any Ruffle load/init failure → a plain error notice, without throwing, so
 *   the rest of the page still renders (R6.5).
 */
export async function mountFlash(
  target: Element,
  options: MountFlashOptions,
  deps: FlashDeps,
): Promise<FlashOutcome> {
  const { doc } = deps;

  if (options.status === 'missing' || options.archiveUrl === undefined) {
    replaceElement(target, noticeElement(doc, 'missing', FLASH_MISSING_MESSAGE));
    return 'missing';
  }

  // Track the currently mounted node so the error path can replace whichever
  // node is live, whether the failure happened before or after we swapped in
  // the player.
  let mounted: Element = target;
  try {
    const ruffle = await deps.loadRuffle();
    const player = ruffle.createPlayer();

    const container = doc.createElement('div');
    container.setAttribute('data-seance-flash', 'playing');
    const label = doc.createElement('p');
    label.textContent = FLASH_PLAYING_MESSAGE;
    container.appendChild(label);
    container.appendChild(player as unknown as Node);

    replaceElement(mounted, container);
    mounted = container;

    await player.load({ url: options.archiveUrl });
    return 'playing';
  } catch {
    replaceElement(mounted, noticeElement(doc, 'error', FLASH_ERROR_MESSAGE));
    return 'error';
  }
}
