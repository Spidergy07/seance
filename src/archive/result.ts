// Shared result and error types for the archive clients.
//
// The clients are the only code that performs network calls, and they call
// only our own `/api/` endpoints (never archive.org directly). They surface
// failures as typed results rather than throwing, so the UI can map each kind
// to a plain, honest message (voice.md, requirements R8.x). See design.md §1.

/** Why an archive request failed, mapped to a UI message by the caller. */
export type ClientErrorKind =
  | 'bad-request' // our request was malformed (a bug on our side)
  | 'rate-limited' // the archive asked us to slow down (HTTP 429)
  | 'timeout' // the archive did not respond in time
  | 'outage' // the archive returned a server error or is unreachable
  | 'network' // the fetch itself failed (offline, DNS, CORS)
  | 'parse-error'; // the response was not the shape we expected

export interface ClientError {
  kind: ClientErrorKind;
  message: string;
  /** The HTTP status from our proxy, when there was a response. */
  status?: number;
}

/** A network result that is either a value or a typed error. */
export type ClientResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ClientError };

export function ok<T>(value: T): ClientResult<T> {
  return { ok: true, value };
}

export function err<T>(error: ClientError): ClientResult<T> {
  return { ok: false, error };
}

/** The JSON error body our proxies return: `{ error, message }`. */
interface ProxyErrorBody {
  error?: string;
  message?: string;
}

/**
 * Map a non-ok proxy `Response` to a `ClientError`. Reads the `{ error }` body
 * when present and falls back to the HTTP status.
 */
export async function errorFromResponse(response: Response): Promise<ClientError> {
  let body: ProxyErrorBody = {};
  try {
    body = (await response.json()) as ProxyErrorBody;
  } catch {
    // Non-JSON error body; fall back to the status code below.
  }

  const message =
    body.message ?? `The archive request failed (HTTP ${response.status}).`;

  switch (response.status) {
    case 400:
      return { kind: 'bad-request', message, status: 400 };
    case 429:
      return { kind: 'rate-limited', message, status: 429 };
    case 504:
      return { kind: 'timeout', message, status: 504 };
    case 502:
    case 503:
      return { kind: 'outage', message, status: response.status };
    default:
      return { kind: 'outage', message, status: response.status };
  }
}

/** Map a thrown fetch failure (offline, DNS, CORS) to a `ClientError`. */
export function errorFromThrow(error: unknown): ClientError {
  const detail = String((error as { message?: unknown })?.message ?? error);
  return {
    kind: 'network',
    message: `Could not reach the archive service: ${detail}`,
  };
}
