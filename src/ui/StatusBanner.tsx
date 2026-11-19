// The status banner: a designed screen for every non-success state. It reads
// its wording from the pure `statusContent`, so this component only decides how
// to present it (tone colour, role, optional retry). Error tones announce
// themselves to assistive tech; quieter ones are polite status updates.
// See requirements R8.1–R8.6, R1.2 and design.md §11.

import { statusContent, type BannerStatus } from './status-banner.js';

export interface StatusBannerProps {
  status: BannerStatus;
  /** Shown as a "Try again" control when the state is retryable. */
  onRetry?: () => void;
}

export function StatusBanner({ status, onRetry }: StatusBannerProps) {
  const content = statusContent(status);
  const assertive = content.tone === 'error';

  return (
    <section
      className={`banner banner--${content.tone}`}
      role={assertive ? 'alert' : 'status'}
      aria-live={assertive ? 'assertive' : 'polite'}
    >
      <h2 className="banner__title">{content.title}</h2>
      <p className="banner__detail">{content.detail}</p>
      {content.nextStep !== undefined && (
        <p className="banner__next">{content.nextStep}</p>
      )}
      {content.retryable && onRetry !== undefined && (
        <button type="button" className="banner__retry" onClick={onRetry}>
          Try again
        </button>
      )}
    </section>
  );
}
