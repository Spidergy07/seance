// Pure layout choice for the result panes. When readability found an article,
// the reader and restored panes sit side by side on a wide screen; when it did
// not, the reader note collapses to a slim line and the restored view takes the
// full pane width (R7.3, task 44). Kept pure so the choice is tested directly,
// with the CSS doing the actual column work.

/**
 * The class for the panes container. With an article it is the two-pane
 * `panes` grid; without one it is `panes panes--solo`, a single full-width
 * column at every width, so the restored view is not cramped next to an empty
 * reader card.
 */
export function resultPanesClass(readerOk: boolean): string {
  return readerOk ? 'panes' : 'panes panes--solo';
}
