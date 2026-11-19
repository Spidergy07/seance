// The URL input: Seance's planchette. The visitor types the address of a dead
// site and starts a recovery. All accept/reject logic lives in the pure
// `interpretUrlInput`; this component only renders the result and raises the
// resolved URL on submit. See requirements R1.1–R1.4.

import { useId, useState, type FormEvent } from 'react';
import { interpretUrlInput, resolvedUrl } from './url-input-logic.js';

export interface UrlInputProps {
  /** A recovery is running: disable the control and show it is busy (R1.4). */
  busy: boolean;
  /** Called with the resolved absolute URL when the visitor submits. */
  onSubmit: (url: string) => void;
  /** Pre-fill the field (used when following an internal link). */
  initialValue?: string;
}

export function UrlInput({ busy, onSubmit, initialValue = '' }: UrlInputProps) {
  const [value, setValue] = useState(initialValue);
  const [touched, setTouched] = useState(false);
  const inputId = useId();
  const messageId = useId();

  const interpretation = interpretUrlInput(value);
  const target = resolvedUrl(interpretation);
  const showError = touched && interpretation.kind === 'invalid';
  const showGuess = interpretation.kind === 'guess';

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) {
      return;
    }
    if (target === null) {
      setTouched(true);
      return;
    }
    onSubmit(target);
  }

  const describedBy = showError || showGuess ? messageId : undefined;

  return (
    <form className="planchette" onSubmit={handleSubmit} noValidate>
      <label className="planchette__label" htmlFor={inputId}>
        Address of the departed site
      </label>
      <div className="planchette__row">
        <input
          id={inputId}
          className="planchette__input"
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Paste the address of a site that no longer loads"
          value={value}
          disabled={busy}
          aria-invalid={showError}
          aria-describedby={describedBy}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => setTouched(true)}
        />
        <button
          type="submit"
          className="planchette__submit"
          disabled={busy || target === null}
          aria-label="Search the archive"
        >
          {busy ? 'Holding the seance…' : 'Hold the seance'}
        </button>
      </div>

      {showGuess && (
        <p id={messageId} className="planchette__hint" aria-live="polite">
          No scheme given. Seance will search for{' '}
          <span className="planchette__interpreted">{interpretation.url}</span>.
        </p>
      )}
      {showError && (
        <p id={messageId} className="planchette__error" role="alert">
          {interpretation.message}
        </p>
      )}
    </form>
  );
}
