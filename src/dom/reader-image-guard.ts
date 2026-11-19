// Reader-view image guard (task 54, R3.13, R7.4). The reader pane renders
// sanitised Readability output in the app's own DOM, not the sandboxed iframe,
// so the restored view's injected image guard (ui/restored-pane-logic
// IMAGE_GUARD_SCRIPT) does not reach it. This applies the same policy over the
// reader's images directly:
//   - hide zero-content tracking pixels (declared or rendered 1×1 / 0×0), so
//     old pages are not littered with invisible one-pixel images; and
//   - replace an image that fails to load with a small styled placeholder,
//     rather than leaving the browser's broken-image icon.
//
// DOM-dependent but framework-free, so it runs under linkedom in tests and in
// the browser at runtime. It marks each image once, so it is idempotent.

/**
 * Plain text shown in place of an image that failed to load from the archive
 * (voice.md: plain, names what happened, no blame). Matches the restored view's
 * placeholder wording so both views read the same.
 */
export const READER_IMAGE_PLACEHOLDER_TEXT =
  'This image was not recovered from the archive.';

/** The attribute used to mark an image the guard has already handled. */
const MARK = 'data-seance-img';

/** A 1×1 or 0×0 image carries no content: it is a tracking pixel. */
function isTrackingSize(width: number, height: number): boolean {
  return width <= 1 && height <= 1;
}

/** Whether the image's declared width and height are both 0 or 1. */
function declaredTrackingPixel(img: Element): boolean {
  const w = img.getAttribute('width');
  const h = img.getAttribute('height');
  if (w === null || h === null) {
    return false;
  }
  const wn = Number(w);
  const hn = Number(h);
  return Number.isFinite(wn) && Number.isFinite(hn) && isTrackingSize(wn, hn);
}

function hideTracking(img: HTMLImageElement): void {
  img.setAttribute(MARK, 'tracking');
  img.style.display = 'none';
}

function buildPlaceholder(doc: Document): HTMLElement {
  const span = doc.createElement('span');
  span.setAttribute(MARK, 'missing');
  span.setAttribute('role', 'note');
  span.className = 'reader__img-missing';
  span.textContent = READER_IMAGE_PLACEHOLDER_TEXT;
  return span;
}

function replaceWithPlaceholder(img: HTMLImageElement): void {
  if (img.getAttribute(MARK) !== null) {
    return;
  }
  const doc = img.ownerDocument;
  if (doc === null || img.parentNode === null) {
    return;
  }
  img.parentNode.replaceChild(buildPlaceholder(doc), img);
}

/**
 * Apply the reader image guard to every `<img>` under `root`. Declared tracking
 * pixels are hidden at once; the rest get `load`/`error` listeners so an image
 * that settles later is still handled (a failure becomes a placeholder, a
 * rendered 1×1 is hidden), plus a synchronous check for images that already
 * loaded before the guard ran.
 */
export function guardReaderImages(root: ParentNode): void {
  const imgs = Array.from(root.querySelectorAll<HTMLImageElement>('img'));
  for (const img of imgs) {
    if (img.getAttribute(MARK) !== null) {
      continue;
    }

    if (declaredTrackingPixel(img)) {
      hideTracking(img);
      continue;
    }

    img.addEventListener('error', () => replaceWithPlaceholder(img));
    img.addEventListener('load', () => {
      if (img.getAttribute(MARK) !== null) {
        return;
      }
      if (isTrackingSize(img.naturalWidth, img.naturalHeight)) {
        hideTracking(img);
      }
    });

    // Already loaded before the listener attached: hide a rendered tracking
    // pixel now. A failure is left to the error listener, matching the restored
    // view's guard (it does not treat complete-with-zero-size as a failure).
    if (
      img.complete &&
      img.naturalWidth > 0 &&
      isTrackingSize(img.naturalWidth, img.naturalHeight)
    ) {
      hideTracking(img);
    }
  }
}
