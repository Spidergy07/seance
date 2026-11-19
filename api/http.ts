// Shared HTTP helper for the serverless proxies (api/cdx.ts, api/snapshot.ts).
//
// It performs one upstream request with a hard per-attempt timeout and a
// bounded exponential backoff with jitter. Retries happen only on transient
// failures: HTTP 429 (rate limited), 5xx server errors, and network/timeout
// errors. Other 4xx responses are not retried. See design.md §11.
//
// No DOM, no React, no persistence. Dependencies (fetch, sleep, random) are
// injectable so the retry and timeout behaviour can be tested offline without
// real timers or the network.

/** The kind of upstream failure, so callers can map it to an HTTP status. */
export type UpstreamErrorKind =
  | 'timeout'
  | 'rate-limited'
  | 'server-error'
  | 'network'
  | 'client-error';

/** A typed failure from an upstream request after retries are exhausted. */
export class UpstreamError extends Error {
  readonly kind: UpstreamErrorKind;
  readonly status: number | undefined;
  /**
   * The original error this one was mapped from, when there is one. For a
   * failed `fetch` the real reason (DNS, TLS, connection refused) lives on the
   * thrown `TypeError`'s own `cause`, so we keep it here for logging.
   */
  readonly cause: unknown;

  constructor(
    kind: UpstreamErrorKind,
    message: string,
    status?: number,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'UpstreamError';
    this.kind = kind;
    this.status = status;
    this.cause = cause;
  }
}

/**
 * Describe an error's `cause` compactly for a log line: name, message, and a
 * `code` (e.g. `ENOTFOUND`) when present. No bodies, no stacks.
 */
function describeCause(cause: unknown): unknown {
  if (cause === undefined || cause === null) {
    return undefined;
  }
  if (cause instanceof Error) {
    return {
      name: cause.name,
      message: cause.message,
      code: (cause as { code?: unknown }).code,
    };
  }
  return String(cause);
}

/**
 * Log an upstream/proxy failure to stderr so it shows up in the platform's
 * function logs (e.g. `vercel logs`). Without this the proxies returned a plain
 * JSON error and logged nothing, so a production failure left no trace. The
 * user-facing response stays plain; this line is for operators and captures the
 * real cause (including a nested `fetch` cause such as `ENOTFOUND`).
 */
export function logProxyFailure(scope: string, error: unknown): void {
  const detail: Record<string, unknown> = { scope };
  if (error instanceof UpstreamError) {
    detail.kind = error.kind;
    detail.status = error.status;
    detail.message = error.message;
    detail.cause = describeCause(error.cause);
  } else if (error instanceof Error) {
    detail.name = error.name;
    detail.message = error.message;
    detail.cause = describeCause((error as { cause?: unknown }).cause);
  } else {
    detail.value = String(error);
  }
  console.error('[seance proxy] upstream failure', detail);
}

/** Injectable side effects, defaulted to real implementations. */
export interface HttpDeps {
  fetch: typeof fetch;
  /** Resolve after `ms` milliseconds. */
  sleep: (ms: number) => Promise<void>;
  /** A value in [0, 1); used for backoff jitter. */
  random: () => number;
}

/** Retry and timeout policy. All times are in milliseconds. */
export interface RetryOptions {
  /** Hard timeout for a single attempt. */
  timeoutMs: number;
  /** Total attempts, including the first. */
  maxAttempts: number;
  /** Base backoff delay; doubled each retry. */
  baseDelayMs: number;
  /** Upper bound on any single backoff delay. */
  maxDelayMs: number;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  // Bounded so one proxy request cannot hold the client's ~20s recovery
  // deadline open, and a sustained 429 surfaces in a couple of seconds, not
  // tens (R8.9). Worst case: 2 × 6s + 1 × 2s backoff = 14s.
  timeoutMs: 6000,
  maxAttempts: 2,
  baseDelayMs: 500,
  maxDelayMs: 2000,
};

/**
 * A normal User-Agent that identifies Seance in plain text. The archive uses it
 * to see who is calling (design.md §11). It follows the usual
 * `Mozilla/5.0 (compatible; ...)` shape with a contact URL, rather than a bare
 * token, because some upstreams treat unusual agents differently. No marketing.
 */
export const SEANCE_USER_AGENT =
  'Mozilla/5.0 (compatible; Seance/1.0; +https://kiroween-seance.vercel.app)';

export function defaultHttpDeps(): HttpDeps {
  return {
    fetch: globalThis.fetch.bind(globalThis),
    sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
    random: Math.random,
  };
}

/**
 * Build a `URL` from an incoming request. Vercel's Edge runtime sets
 * `request.url` to an absolute URL, but the Node.js runtime adapter sets it to
 * a path-and-query only (e.g. `/api/cdx?url=...`), which `new URL()` rejects
 * with `ERR_INVALID_URL`. Resolving against a dummy base parses both: an
 * absolute `request.url` ignores the base, a relative one uses it. The handlers
 * only read `pathname` and `searchParams`, so the dummy host never leaks out.
 */
export function toRequestUrl(request: Request): URL {
  return new URL(request.url, 'http://seance.local');
}

/** One attempt with a hard timeout enforced by an AbortController. */
async function fetchOnce(
  url: string,
  init: RequestInit,
  deps: HttpDeps,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await deps.fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** True for an abort raised by our timeout controller. */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

/**
 * Parse a `Retry-After` header. Supports an integer number of seconds and an
 * HTTP date. Returns milliseconds, or null if absent or unparseable.
 */
export function parseRetryAfter(
  value: string | null,
  now: number = Date.now(),
): number | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10) * 1000;
  }
  const date = Date.parse(trimmed);
  if (!Number.isNaN(date)) {
    return Math.max(0, date - now);
  }
  return null;
}

/** Exponential backoff with full jitter, capped at `maxDelayMs`. */
function backoffDelay(
  attempt: number,
  options: RetryOptions,
  random: () => number,
): number {
  const exponential = options.baseDelayMs * 2 ** (attempt - 1);
  const capped = Math.min(options.maxDelayMs, exponential);
  // Full jitter: a random point in [0, capped].
  return Math.round(random() * capped);
}

/**
 * Fetch `url` with retries. Returns the first response with status < 400.
 * Throws `UpstreamError` when retries are exhausted or a non-retryable status
 * (a 4xx other than 429) is received.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  deps: HttpDeps,
  options: RetryOptions = DEFAULT_RETRY_OPTIONS,
): Promise<Response> {
  let lastError: UpstreamError | null = null;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    const isLast = attempt === options.maxAttempts;
    let response: Response | null = null;

    try {
      response = await fetchOnce(url, init, deps, options.timeoutMs);
    } catch (error) {
      // Timeout (abort) and network errors are transient: retry if we can.
      const kind: UpstreamErrorKind = isAbortError(error) ? 'timeout' : 'network';
      const message = isAbortError(error)
        ? `Upstream request timed out after ${options.timeoutMs}ms`
        : `Network error contacting upstream: ${String(
            (error as { message?: unknown })?.message ?? error,
          )}`;
      lastError = new UpstreamError(kind, message, undefined, error);
      if (isLast) {
        throw lastError;
      }
      await deps.sleep(backoffDelay(attempt, options, deps.random));
      continue;
    }

    if (response.status < 400) {
      return response;
    }

    if (response.status === 429) {
      lastError = new UpstreamError(
        'rate-limited',
        'Upstream signalled rate limiting (HTTP 429)',
        429,
      );
      if (isLast) {
        throw lastError;
      }
      const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
      const delay = retryAfter ?? backoffDelay(attempt, options, deps.random);
      await deps.sleep(Math.min(delay, options.maxDelayMs));
      continue;
    }

    if (response.status >= 500) {
      lastError = new UpstreamError(
        'server-error',
        `Upstream server error (HTTP ${response.status})`,
        response.status,
      );
      if (isLast) {
        throw lastError;
      }
      await deps.sleep(backoffDelay(attempt, options, deps.random));
      continue;
    }

    // Any other 4xx is the request's fault, not transient: do not retry.
    throw new UpstreamError(
      'client-error',
      `Upstream rejected the request (HTTP ${response.status})`,
      response.status,
    );
  }

  // Unreachable: the loop either returns or throws. Satisfy the type checker.
  throw (
    lastError ?? new UpstreamError('network', 'Upstream request failed')
  );
}

/** Map an `UpstreamError` to the HTTP status our proxy should return. */
export function statusForUpstreamError(error: UpstreamError): number {
  switch (error.kind) {
    case 'rate-limited':
      return 429;
    case 'timeout':
      return 504;
    case 'server-error':
    case 'network':
      return 502;
    case 'client-error':
      return 400;
  }
}
