// The app shell. It holds the phase the visitor is in (idle → running →
// done/error), renders the planchette input, and runs the recovery pipeline.
// The panes, death certificate, and status banner are slotted in by later
// Phase 4 tasks; this file is the state machine that drives them.
//
// The recovery function is injectable so tests drive the shell without a
// network. See requirements R1.4 and design.md §3.

import { useCallback, useRef, useState } from 'react';
import { UrlInput } from './UrlInput.js';
import { browserRecoverDeps, recover } from './recover.js';
import type { AppPhase, RecoveryOutcome } from './types.js';

export interface AppProps {
  /** Run one recovery. Defaults to the browser pipeline. Injected in tests. */
  recover?: (url: string) => Promise<RecoveryOutcome>;
}

function defaultRecover(url: string): Promise<RecoveryOutcome> {
  return recover(url, browserRecoverDeps());
}

/** Build the error phase, including only the optional fields that are present. */
function errorPhase(url: string, outcome: Extract<RecoveryOutcome, { ok: false }>): AppPhase {
  const phase: AppPhase = { status: 'error', url, kind: outcome.kind };
  if (outcome.detail !== undefined) {
    phase.detail = outcome.detail;
  }
  if (outcome.fallbackCapture !== undefined) {
    phase.fallbackCapture = outcome.fallbackCapture;
  }
  return phase;
}

export function App(props: AppProps) {
  const runRecovery = props.recover ?? defaultRecover;
  const [phase, setPhase] = useState<AppPhase>({ status: 'idle' });
  // Guards against a slow earlier recovery overwriting a newer one.
  const runId = useRef(0);

  const start = useCallback(
    async (url: string) => {
      const id = runId.current + 1;
      runId.current = id;
      setPhase({ status: 'running', url });

      let outcome: RecoveryOutcome;
      try {
        outcome = await runRecovery(url);
      } catch {
        outcome = {
          ok: false,
          kind: 'outage',
          detail: 'Something went wrong while rebuilding the page.',
        };
      }
      if (id !== runId.current) {
        return; // a newer recovery started; drop this result
      }
      setPhase(outcome.ok ? { status: 'done', view: outcome.view } : errorPhase(url, outcome));
    },
    [runRecovery],
  );

  const busy = phase.status === 'running';

  return (
    <div className="seance">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="board" role="banner">
        <p className="board__eyebrow">A seance for dead websites</p>
        <h1 className="board__title">Seance</h1>
        <p className="board__subtitle">
          Paste the address of a site that no longer loads. Seance looks for a
          saved copy in the Internet Archive and shows what it could recover.
        </p>
        <UrlInput busy={busy} onSubmit={start} />
      </header>

      <main id="main" className="stage" tabIndex={-1}>
        {phase.status === 'idle' && (
          <section className="stage__intro" aria-label="How Seance works">
            <ol className="steps">
              <li>
                <span className="steps__themed">Make contact.</span> Seance
                queries the Internet Archive for saved copies of the address.
              </li>
              <li>
                <span className="steps__themed">Read the certificate.</span> It
                reports when the site last worked and how much came back.
              </li>
              <li>
                <span className="steps__themed">Sit with the page.</span> The
                restored page and a clean reader view appear side by side.
              </li>
            </ol>
          </section>
        )}

        {phase.status === 'running' && (
          <section className="contacting" role="status" aria-live="polite">
            <span className="contacting__pulse" aria-hidden="true" />
            <p className="contacting__line">
              Holding the seance. Searching the Internet Archive for{' '}
              <span className="contacting__url">{phase.url}</span>.
            </p>
          </section>
        )}

        {phase.status === 'error' && (
          // Replaced by the StatusBanner component in task 21.
          <section className="placeholder" role="alert">
            <p>Recovery stopped: {phase.kind}.</p>
            {phase.detail && <p>{phase.detail}</p>}
          </section>
        )}

        {phase.status === 'done' && (
          // Panes and the death certificate are slotted in by tasks 18–20.
          <section className="placeholder" aria-label="Recovery result">
            <p>
              Recovered {phase.view.report.recoveredCount} of{' '}
              {phase.view.report.totalCount} assets (
              {phase.view.report.recoveryPercent}%).
            </p>
          </section>
        )}
      </main>

      <footer className="credits" role="contentinfo">
        <p>
          Restoration data comes from the Internet Archive Wayback Machine.
          Flash playback uses the Ruffle project. Named in plain text, without
          their marks, and without implying endorsement.
        </p>
      </footer>
    </div>
  );
}
