// An error boundary around the result panels. The recovery itself can succeed
// and still hand a panel data it cannot render; without a boundary a thrown
// render error unmounts the whole app and leaves a blank page. This contains
// the failure and shows a plain message with a retry, so the visitor is never
// left staring at nothing (R5.5, voice.md). See design.md §6.

import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ResultErrorFallbackProps {
  /** Re-run the recovery for the current URL. */
  onRetry?: () => void;
}

/**
 * The plain fallback shown when a result panel throws. Names what happened,
 * does not blame the user, and offers a next step (voice.md).
 */
export function ResultErrorFallback({ onRetry }: ResultErrorFallbackProps) {
  return (
    <section className="result-error" role="alert" aria-label="Display problem">
      <p className="result-error__line">
        Seance recovered the page but could not display this part of the result.
        This is a fault on our side, not a problem with the address.
      </p>
      {onRetry !== undefined && (
        <button type="button" className="result-error__retry" onClick={onRetry}>
          Try again
        </button>
      )}
    </section>
  );
}

export interface ResultErrorBoundaryProps {
  onRetry?: () => void;
  children?: ReactNode;
}

interface ResultErrorBoundaryState {
  hasError: boolean;
}

/**
 * Catches render errors from the result panels and shows `ResultErrorFallback`
 * instead of propagating the error (which would blank the page). Retry resets
 * the boundary and re-runs recovery through `onRetry`.
 */
export class ResultErrorBoundary extends Component<
  ResultErrorBoundaryProps,
  ResultErrorBoundaryState
> {
  constructor(props: ResultErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ResultErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface the detail in the console for debugging; no user data is logged.
    console.error('Seance result panel failed to render', error, info);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false });
    this.props.onRetry?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const props: ResultErrorFallbackProps =
        this.props.onRetry !== undefined ? { onRetry: this.handleRetry } : {};
      return <ResultErrorFallback {...props} />;
    }
    return this.props.children;
  }
}
