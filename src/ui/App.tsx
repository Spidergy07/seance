// The app shell. It holds the phase the visitor is in (idle → running →
// done/error), renders the planchette input, and runs the recovery pipeline.
// The panes, death certificate, and status banner are slotted in by later
// Phase 4 tasks; this file is the state machine that drives them.
//
// The recovery function is injectable so tests drive the shell without a
// network. See requirements R1.4 and design.md §3.

import { useCallback, useRef, useState } from 'react';
import { UrlInput } from './UrlInput.js';
import { RestoredPane } from './RestoredPane.js';
import { ReaderPane } from './ReaderPane.js';
import { DeathCertificate } from './DeathCertificate.js';
import { StatusBanner } from './StatusBanner.js';
import { browserRecoverDeps, recover } from './recover.js';
import { formatCaptureDate } from './format.js';
import type { BannerStatus } from './status-banner.js';
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

/** Map an error phase onto the banner's status (its copy lives in that module). */
function errorBannerStatus(phase: Extract<AppPhase, { status: 'error' }>): BannerStatus {
  switch (phase.kind) {
    case 'invalid-url':
      return {
        kind: 'invalid-url',
        message: phase.detail ?? 'This is not a complete web address.',
      };
    case 'no-captures':
      return { kind: 'no-captures', url: phase.url };
    case 'no-working-capture': {
      const status: BannerStatus = { kind: 'no-working-capture', url: phase.url };
      if (phase.fallbackCapture !== undefined) {
        status.fallbackDate = formatCaptureDate(phase.fallbackCapture.timestamp);
      }
      return status;
    }
    case 'rate-limited':
      return { kind: 'rate-limited' };
    case 'timeout':
      return { kind: 'timeout' };
    case 'network':
      return { kind: 'network' };
    case 'outage':
      return { kind: 'outage' };
  }
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
          <StatusBanner
            status={errorBannerStatus(phase)}
            onRetry={() => start(phase.url)}
          />
        )}

        {phase.status === 'done' && (
          <section className="result" aria-label="Recovery result">
            {phase.view.report.recoveryPercent < 100 && (
              <StatusBanner
                status={{
                  kind: 'partial',
                  recoveredCount: phase.view.report.recoveredCount,
                  missingCount: phase.view.report.assets.filter(
                    (a) => a.status === 'missing',
                  ).length,
                  totalCount: phase.view.report.totalCount,
                }}
              />
            )}
            <DeathCertificate report={phase.view.report} />
            <div className="panes">
              {/* Reader is first in the DOM so it leads when the panes stack
                  on a narrow screen (R7.2). */}
              <ReaderPane reader={phase.view.reader} />
              <RestoredPane
                html={phase.view.restoredHtml}
                pageOriginalUrl={phase.view.pageOriginalUrl}
                onNavigate={start}
                hasFlash={phase.view.hasFlash}
              />
            </div>
          </section>
        )}
      </main>

      <footer className="credits" role="contentinfo" aria-label="About and credits">
        <p>
          Restoration data comes from the Internet Archive Wayback Machine.
          Flash playback uses the Ruffle project, loaded from its official
          build only for pages that reference a Flash file. Seance keeps no
          account, saves no history, and stores nothing on the server. Named in
          plain text, without their marks, and without implying endorsement.
        </p>
      </footer>
    </div>
  );
}
