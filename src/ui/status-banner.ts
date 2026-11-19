// Pure copy for every non-success state (design.md §11). Each state maps to a
// plain message that says what happened, why, and what the visitor can do
// next, never blaming them (voice.md, R8.1–R8.6, R1.2). The component only
// renders what this returns, so the wording is tested directly under Node.

/** How loud the banner is, and which colour it carries. */
export type BannerTone = 'info' | 'warn' | 'error' | 'partial';

/** The state the banner describes. */
export type BannerStatus =
  | { kind: 'invalid-url'; message: string }
  | { kind: 'no-captures'; url: string }
  | { kind: 'no-working-capture'; url: string; fallbackDate?: string }
  | { kind: 'slow' }
  | { kind: 'rate-limited'; retryInSeconds?: number }
  | { kind: 'timeout' }
  | { kind: 'outage' }
  | { kind: 'network' }
  | {
      kind: 'partial';
      recoveredCount: number;
      missingCount: number;
      totalCount: number;
    }
  | { kind: 'flash-missing' }
  | { kind: 'ruffle-failure' };

export interface BannerContent {
  tone: BannerTone;
  /** A short themed-but-clear headline. */
  title: string;
  /** Plain prose: what happened and why. */
  detail: string;
  /** What the visitor can do next, when there is something to do. */
  nextStep?: string;
  /** True when the state is worth retrying (shows a retry control). */
  retryable: boolean;
}

export function statusContent(status: BannerStatus): BannerContent {
  switch (status.kind) {
    case 'invalid-url':
      return {
        tone: 'warn',
        title: 'That address needs a second look',
        detail: status.message,
        nextStep: 'Fix the address, then hold the seance again.',
        retryable: false,
      };

    case 'no-captures':
      return {
        tone: 'info',
        title: 'No contact',
        detail: `The Internet Archive has no saved copy of ${status.url}.`,
        nextStep: 'Check the spelling, or try a different address.',
        retryable: false,
      };

    case 'no-working-capture':
      return {
        tone: 'warn',
        title: 'Saved, but never whole',
        detail:
          status.fallbackDate !== undefined
            ? `The archive saved this address but never with a working (200) response. The closest attempt is from ${status.fallbackDate}.`
            : 'The archive saved this address but never with a working (200) response.',
        nextStep: 'Seance can show that best-effort capture, or try another address.',
        retryable: false,
      };

    case 'slow':
      return {
        tone: 'info',
        title: 'Still reaching through',
        detail: 'The Internet Archive is taking a while to respond.',
        nextStep: 'Seance will wait, then stop if it takes too long.',
        retryable: true,
      };

    case 'rate-limited':
      return {
        tone: 'warn',
        title: 'The archive asked us to slow down',
        detail:
          status.retryInSeconds !== undefined
            ? `The Internet Archive is busy and asked us to slow down. Trying again in ${status.retryInSeconds} second${status.retryInSeconds === 1 ? '' : 's'}.`
            : 'The Internet Archive is busy and asked us to slow down. Waiting a moment, then trying again.',
        nextStep: 'You can try again now, or give the archive a moment first.',
        retryable: true,
      };

    case 'timeout':
      return {
        tone: 'error',
        title: 'No answer in time',
        detail:
          'The Internet Archive did not respond in time. This is on their side or the network, not your address.',
        nextStep: 'Try again shortly.',
        retryable: true,
      };

    case 'outage':
      return {
        tone: 'error',
        title: 'The other side is quiet',
        detail:
          'We could not reach the Internet Archive right now. This is on their side or the network, not your address.',
        nextStep: 'Try again shortly.',
        retryable: true,
      };

    case 'network':
      return {
        tone: 'error',
        title: 'The line went dead',
        detail:
          'The connection to the archive service failed. This looks like a network problem, not your address.',
        nextStep: 'Check your connection, then try again.',
        retryable: true,
      };

    case 'partial': {
      const notReached = status.totalCount - status.recoveredCount;
      return {
        tone: 'partial',
        title: 'Partial contact',
        detail: `${status.recoveredCount} of ${status.totalCount} assets recovered. ${notReached} could not be reached.`,
        nextStep: 'The restored page is shown below, with the gaps named in the certificate.',
        retryable: false,
      };
    }

    case 'flash-missing':
      return {
        tone: 'warn',
        title: 'A Flash file was not saved',
        detail:
          'This page referenced a Flash file, but no copy was saved. It cannot be played.',
        retryable: false,
      };

    case 'ruffle-failure':
      return {
        tone: 'error',
        title: 'The Flash player could not start',
        detail:
          'This page contains Flash, but the Ruffle player could not start. The rest of the page is shown.',
        retryable: false,
      };
  }
}
