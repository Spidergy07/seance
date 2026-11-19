// The Restored pane: the rebuilt page, rendered inside a sandboxed iframe so
// archived HTML and scripts (untrusted) cannot reach the Seance app or the
// user's archive session (R3.7, R9.2). Links inside the frame post a message
// to the shell, which re-runs recovery for that page rather than loading the
// live web (R3.8). See design.md §8.

import { useEffect, useMemo } from 'react';
import {
  DEFAULT_RUFFLE_SRC,
  RESTORED_SANDBOX,
  buildRestoredSrcDoc,
  parseRestoredMessage,
  type RestoredSrcDocOptions,
} from './restored-pane-logic.js';

export interface RestoredPaneProps {
  /** The rewritten full-document HTML to render. */
  html: string;
  /** The dead-site URL this page was recovered from, shown as context. */
  pageOriginalUrl: string;
  /** Called with the original URL of an internal link the visitor follows. */
  onNavigate: (originalUrl: string) => void;
  /** When true, load Ruffle so recovered `.swf` embeds play (R6.1, R6.2). */
  hasFlash?: boolean;
  /** Override the Ruffle loader URL (defaults to the official build). */
  ruffleScriptUrl?: string;
}

export function RestoredPane({
  html,
  pageOriginalUrl,
  onNavigate,
  hasFlash = false,
  ruffleScriptUrl = DEFAULT_RUFFLE_SRC,
}: RestoredPaneProps) {
  const srcDoc = useMemo(() => {
    const options: RestoredSrcDocOptions = {};
    if (hasFlash) {
      options.ruffleScriptUrl = ruffleScriptUrl;
    }
    return buildRestoredSrcDoc(html, options);
  }, [html, hasFlash, ruffleScriptUrl]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const navigate = parseRestoredMessage(event.data);
      if (navigate !== null) {
        onNavigate(navigate.originalUrl);
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onNavigate]);

  return (
    <section className="pane pane--restored" aria-label="Restored page">
      <header className="pane__head">
        <h2 className="pane__title">
          Restored <span className="pane__literal">— the saved page</span>
        </h2>
        <p className="pane__note">
          Loaded from the Internet Archive. Links reopen through Seance, not the
          live web.
        </p>
      </header>
      <iframe
        className="pane__frame"
        title={`Restored page for ${pageOriginalUrl}`}
        sandbox={RESTORED_SANDBOX}
        srcDoc={srcDoc}
        referrerPolicy="no-referrer"
        loading="lazy"
      />
    </section>
  );
}
