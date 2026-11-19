// Shared UI types: the app phases the shell moves through, and the view model
// a finished recovery hands to the panes. Kept here so App, the panes, and the
// recovery pipeline agree on one shape. No DOM, no React in this file.

import type { Capture, RecoveryReport } from '../core/types.js';
import type { ReaderResult } from '../dom/reader.js';

/**
 * Why a recovery stopped short. Maps the archive client's failure kinds and
 * the capture-selection outcomes onto the states the status banner explains
 * (design.md §11). `invalid-url` is caught before any network call (R1.2).
 */
export type RecoveryErrorKind =
  | 'invalid-url'
  | 'no-captures'
  | 'no-working-capture'
  | 'rate-limited'
  | 'timeout'
  | 'outage'
  | 'network';

/** Everything a successful recovery produces for the panes. */
export interface RecoveryView {
  /** The dead site's URL that was recovered. */
  pageOriginalUrl: string;
  /** The capture actually used to rebuild the page. */
  selectedCapture: Capture;
  /** The recovery report (death-certificate data). */
  report: RecoveryReport;
  /** The full rewritten document HTML for the sandboxed Restored pane. */
  restoredHtml: string;
  /** The extracted reader view, or the no-article result. */
  reader: ReaderResult;
}

/** The outcome of a recovery attempt: a view, or a typed stop. */
export type RecoveryOutcome =
  | { ok: true; view: RecoveryView }
  | {
      ok: false;
      kind: RecoveryErrorKind;
      /** A plain detail line, when the client gave one. */
      detail?: string;
      /** A best-effort non-200 capture to offer, for `no-working-capture`. */
      fallbackCapture?: Capture;
    };

/** The shell's current screen. */
export type AppPhase =
  | { status: 'idle' }
  | { status: 'running'; url: string }
  | {
      status: 'error';
      url: string;
      kind: RecoveryErrorKind;
      detail?: string;
      fallbackCapture?: Capture;
    }
  | { status: 'done'; view: RecoveryView };
