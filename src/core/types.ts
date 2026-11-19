// Shared domain types for Seance's pure core.
//
// This module is pure: no DOM, no network, no React. It only declares the
// shapes that the rewriter, capture selection, and recovery accounting pass
// around. See design.md section 2.

/** The dead site's URL, absolute (http or https). */
export type OriginalUrl = string;

/**
 * A Wayback archive URL of the form
 * `https://web.archive.org/web/<timestamp>[id_]/<originalUrl>`.
 * The optional `id_` modifier requests the raw, un-rewritten resource.
 */
export type ArchiveUrl = string;

/** One archived snapshot of a URL at a timestamp, from the CDX index. */
export interface Capture {
  originalUrl: OriginalUrl;
  /** 14-digit Wayback timestamp, e.g. `20080303120000`. */
  timestamp: string;
  /** Archived HTTP status code (200, 404, ...). */
  statusCode: number;
  mimeType: string;
}

/** The kind of resource a reference points at, used to group the report. */
export type AssetKind =
  | 'image'
  | 'stylesheet'
  | 'script'
  | 'media'
  | 'flash'
  | 'other';

/**
 * Whether an asset was recovered from the archive. `unknown` means we could
 * not determine the status; it never counts as recovered (see design.md §6).
 */
export type AssetStatus = 'recovered' | 'missing' | 'unknown';

/** The result of trying to recover one referenced asset. */
export interface AssetResult {
  originalUrl: OriginalUrl;
  kind: AssetKind;
  status: AssetStatus;
  /** Present only when `status === 'recovered'`. */
  archiveUrl?: ArchiveUrl;
}

/** The recovery report shown as the "death certificate". */
export interface RecoveryReport {
  selectedCapture: Capture;
  /** The most recent working (status-200) capture, or null if none exists. */
  lastWorkingCapture: Capture | null;
  assets: AssetResult[];
  recoveredCount: number;
  totalCount: number;
  /** Whole number: recovered / total * 100. */
  recoveryPercent: number;
}

/**
 * Resolve capture status for a batch of original URLs. A key mapped to a
 * `Capture` means the archive has that capture; mapped to `null` means the
 * archive has no capture (the asset is missing); an absent key means the
 * status could not be determined (the asset is unknown, never counted as
 * recovered). This is a pure signature: the network lives behind it.
 */
export type CaptureLookup = (
  urls: readonly string[],
) => Promise<ReadonlyMap<OriginalUrl, Capture | null>>;
