// Reader view: extract the archived page's main content with Readability, then
// rewrite its asset URLs with the same core rewriter so reader-view images also
// load from the archive. See design.md §10 and requirements R7.1, R7.3, R7.4.
//
// DOM-dependent, but parsing is injected (`DOMParser` in the browser,
// `linkedom` in tests) and the Readability factory is injectable too, so the
// no-article path can be tested deterministically.

import { Readability } from '@mozilla/readability';
import { rewriteDocument } from './rewrite-document.js';
import type { RewriteContext } from '../core/url-rewriter.js';

/** The subset of Readability's result the reader view needs. */
export interface ReaderArticle {
  title: string;
  content: string;
}

export interface ReaderDeps {
  /** Parse an HTML string into a Document (fresh each call). */
  parseHtml: (html: string) => Document;
  /** Build a Readability-like extractor. Defaults to @mozilla/readability. */
  createReadability?: (doc: Document) => { parse: () => ReaderArticle | null };
}

export type ReaderResult =
  | { ok: true; title: string; contentHtml: string }
  | { ok: false; reason: 'no-article' };

function defaultReadability(doc: Document): { parse: () => ReaderArticle | null } {
  return new Readability(doc);
}

/**
 * Extract a clean reader view from archived HTML.
 *
 * Readability runs on a fresh parse of `html` (it mutates its input, so we
 * never touch the caller's restored document). The extracted content keeps its
 * relative/original URLs, which `rewriteDocument` then points at the archive
 * (R7.4). Returns `{ ok: false, reason: 'no-article' }` when no article is
 * found (R7.3).
 */
export function extractReader(
  html: string,
  ctx: RewriteContext,
  deps: ReaderDeps,
): ReaderResult {
  const doc = deps.parseHtml(html);
  const reader = (deps.createReadability ?? defaultReadability)(doc);

  let article: ReaderArticle | null;
  try {
    article = reader.parse();
  } catch {
    article = null;
  }

  if (article === null || article.content.trim() === '') {
    return { ok: false, reason: 'no-article' };
  }

  // Wrap the content fragment in a document shell so body.innerHTML is reliable
  // across DOM implementations, then rewrite its asset URLs.
  const contentDoc = deps.parseHtml(
    `<!doctype html><html><body>${article.content}</body></html>`,
  );
  rewriteDocument(contentDoc, ctx);

  return {
    ok: true,
    title: article.title,
    contentHtml: contentDoc.body?.innerHTML ?? '',
  };
}
