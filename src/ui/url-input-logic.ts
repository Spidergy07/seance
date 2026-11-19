// Pure validation for the URL input. No DOM, no React, so the accept/reject
// rules and the scheme-guess behaviour are tested directly under Node. The UI
// component (UrlInput) renders whatever this returns. See requirements
// R1.1–R1.3 and design.md §3 step 1.
//
// Validation uses the WHATWG URL API, the same parser the rewriter relies on,
// so what we accept here is exactly what resolves later.

/** The result of interpreting whatever the user typed. */
export type UrlInterpretation =
  | { kind: 'empty' }
  | { kind: 'valid'; url: string }
  /** No scheme typed, but it reads as a host; we offer `https://` (R1.3). */
  | { kind: 'guess'; url: string; typed: string }
  | { kind: 'invalid'; message: string };

/** Leading `scheme:` of a reference, if the user typed one. */
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

function invalid(message: string): UrlInterpretation {
  return { kind: 'invalid', message };
}

/**
 * Interpret raw input into one of four outcomes. Never performs a network
 * call; the caller does that only for `valid` and (after the user accepts)
 * `guess`. Error messages name the problem and say what to do, without
 * blaming the user (voice.md).
 */
export function interpretUrlInput(raw: string): UrlInterpretation {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { kind: 'empty' };
  }

  // The user typed an explicit scheme: it must be http or https.
  if (SCHEME_RE.test(trimmed)) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return invalid(
        'This is not a complete web address. Check for typos, then try again.',
      );
    }
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return { kind: 'valid', url: parsed.href };
    }
    const scheme = parsed.protocol.replace(/:$/, '');
    return invalid(
      `Seance opens http and https addresses. This one uses “${scheme}”, which it cannot open.`,
    );
  }

  // No scheme typed. Try to read it as a host and offer https:// (R1.3).
  let guessed: URL;
  try {
    guessed = new URL(`https://${trimmed}`);
  } catch {
    return invalid('Add a full web address, for example https://example.com.');
  }
  // A plausible host has a dot in it and no whitespace in the input.
  if (!/\s/.test(trimmed) && guessed.hostname.includes('.')) {
    return { kind: 'guess', url: guessed.href, typed: trimmed };
  }
  return invalid('Add a full web address, for example https://example.com.');
}

/**
 * The URL a submit should search for, or null when the input is not ready.
 * `guess` resolves to the `https://` interpretation the user has already been
 * shown (R1.3).
 */
export function resolvedUrl(interpretation: UrlInterpretation): string | null {
  switch (interpretation.kind) {
    case 'valid':
    case 'guess':
      return interpretation.url;
    default:
      return null;
  }
}
