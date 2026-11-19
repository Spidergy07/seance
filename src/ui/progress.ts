// The steps a recovery walks through, and their plain progress lines (R8.10).
//
// Pure: no DOM, no React. `recover` reports each step through its `onProgress`
// callback as it enters that phase, and the shell shows the current step's line
// so the visitor sees which step is running instead of one static message.

export type RecoveryStep =
  | 'contacting' // querying the archive for captures
  | 'retrieving' // fetching the archived page
  | 'rebuilding' // rewriting the page to load from the archive
  | 'checking' // resolving which assets were saved
  | 'reading'; // extracting the reader view

/** The steps in the order a recovery runs them. */
export const RECOVERY_STEPS: readonly RecoveryStep[] = [
  'contacting',
  'retrieving',
  'rebuilding',
  'checking',
  'reading',
];

const LABELS: Record<RecoveryStep, string> = {
  contacting: 'Reaching the Internet Archive for saved copies.',
  retrieving: 'Found a saved copy. Retrieving the page.',
  rebuilding: 'Rebuilding the page to load from the archive.',
  checking: 'Checking which assets were saved.',
  reading: 'Preparing the reader view.',
};

/** The plain line shown while `step` is running. */
export function recoveryStepLabel(step: RecoveryStep): string {
  return LABELS[step];
}
