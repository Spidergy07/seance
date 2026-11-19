// Build and parse Wayback archive URLs. This is the single source of truth for
// the archive prefix, so the rewriter's confinement invariant (design.md
// §4.3 I2) has exactly one place to reason about.
//
// Pure module: no DOM, no network. See design.md §4.2 step 6 and §4.4.

import type { ArchiveUrl, OriginalUrl } from './types.js';

/** The only host any rewritten resource may point at. */
export const ARCHIVE_HOST = 'web.archive.org';

/** Fixed prefix for every archive URL Seance builds. */
export const ARCHIVE_PREFIX = `https://${ARCHIVE_HOST}/web/`;

/** A Wayback timestamp is exactly 14 digits (YYYYMMDDhhmmss). */
const TIMESTAMP_RE = /^\d{14}$/;

/**
 * Matches an already-archived URL and pulls out its parts. The modifier (e.g.
 * `id_`, `im_`, `js_`) is optional; only `id_` means "raw". The original URL is
 * captured verbatim because Wayback appends it un-encoded after the prefix.
 */
const ARCHIVE_URL_RE =
  /^https?:\/\/web\.archive\.org\/web\/(\d{14})([a-z]{2,3}_)?\/(.*)$/;

export interface BuildArchiveUrlOptions {
  /** Use the `id_` raw modifier so the archive serves the original bytes. */
  raw?: boolean;
}

export interface ParsedArchiveUrl {
  originalUrl: OriginalUrl;
  timestamp: string;
  raw: boolean;
}

/**
 * Build an archive URL for an original URL at a capture timestamp.
 *
 * The original URL is appended verbatim, matching Wayback's own scheme. Pass
 * `raw: true` to request the un-rewritten resource via the `id_` modifier.
 *
 * Throws if the timestamp is not 14 digits, so a malformed capture can never
 * produce a malformed archive URL.
 */
export function buildArchiveUrl(
  originalUrl: OriginalUrl,
  timestamp: string,
  options: BuildArchiveUrlOptions = {},
): ArchiveUrl {
  if (!TIMESTAMP_RE.test(timestamp)) {
    throw new Error(
      `Invalid Wayback timestamp: ${JSON.stringify(timestamp)} (expected 14 digits)`,
    );
  }
  const modifier = options.raw ? 'id_' : '';
  return `${ARCHIVE_PREFIX}${timestamp}${modifier}/${originalUrl}`;
}

/**
 * Parse an archive URL back into its parts, or return null if the string is not
 * an archive URL. Used by the rewriter to detect already-archived input so a
 * second rewrite is a no-op (design.md §4.2 step 4).
 */
export function parseArchiveUrl(archiveUrl: ArchiveUrl): ParsedArchiveUrl | null {
  const match = ARCHIVE_URL_RE.exec(archiveUrl.trim());
  if (!match) {
    return null;
  }
  const timestamp = match[1] ?? '';
  const modifier = match[2];
  const originalUrl = match[3] ?? '';
  return {
    originalUrl,
    timestamp,
    raw: modifier === 'id_',
  };
}

/** True if the string is already a Wayback archive URL. */
export function isArchiveUrl(value: string): boolean {
  return ARCHIVE_URL_RE.test(value.trim());
}
