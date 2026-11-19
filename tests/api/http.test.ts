import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_RETRY_OPTIONS,
  UpstreamError,
  fetchWithRetry,
  logProxyFailure,
  parseRetryAfter,
  statusForUpstreamError,
  toRequestUrl,
  type HttpDeps,
  type RetryOptions,
} from '../../api/http.js';

// A fetch stand-in driven by a script of response factories. Each call
// consumes the next entry. Records the arguments it was called with.
function scriptedFetch(script: Array<() => Response | Promise<Response>>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let index = 0;
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const factory = script[index];
    index += 1;
    if (!factory) {
      throw new Error(`unexpected fetch call #${index}`);
    }
    return factory();
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function deps(fetchImpl: typeof fetch): HttpDeps {
  return {
    fetch: fetchImpl,
    // Resolve immediately so backoff does not slow the tests.
    sleep: async () => {},
    random: () => 0.5,
  };
}

const fastOptions: RetryOptions = {
  timeoutMs: 50,
  maxAttempts: 3,
  baseDelayMs: 1,
  maxDelayMs: 4,
};

describe('fetchWithRetry', () => {
  it('returns the first response with status < 400', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () => new Response('ok', { status: 200 }),
    ]);
    const res = await fetchWithRetry('https://x/', {}, deps(fetchImpl), fastOptions);
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it('retries on 429 then succeeds', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () => new Response('slow down', { status: 429 }),
      () => new Response('ok', { status: 200 }),
    ]);
    const res = await fetchWithRetry('https://x/', {}, deps(fetchImpl), fastOptions);
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it('retries on a 5xx then succeeds', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () => new Response('boom', { status: 503 }),
      () => new Response('ok', { status: 200 }),
    ]);
    const res = await fetchWithRetry('https://x/', {}, deps(fetchImpl), fastOptions);
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it('gives up with a rate-limited error after the capped attempts', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () => new Response('', { status: 429 }),
      () => new Response('', { status: 429 }),
      () => new Response('', { status: 429 }),
    ]);
    await expect(
      fetchWithRetry('https://x/', {}, deps(fetchImpl), fastOptions),
    ).rejects.toMatchObject({ kind: 'rate-limited', status: 429 });
    expect(calls).toHaveLength(3);
  });

  it('does not retry a 4xx other than 429', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () => new Response('nope', { status: 404 }),
    ]);
    await expect(
      fetchWithRetry('https://x/', {}, deps(fetchImpl), fastOptions),
    ).rejects.toMatchObject({ kind: 'client-error', status: 404 });
    expect(calls).toHaveLength(1);
  });

  it('aborts an attempt that exceeds the timeout', async () => {
    let aborted = false;
    const hangingFetch = ((_url: string, init: RequestInit = {}) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init.signal as AbortSignal | undefined;
        signal?.addEventListener('abort', () => {
          aborted = true;
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      })) as unknown as typeof fetch;

    await expect(
      fetchWithRetry('https://x/', {}, deps(hangingFetch), {
        ...fastOptions,
        maxAttempts: 1,
        timeoutMs: 20,
      }),
    ).rejects.toMatchObject({ kind: 'timeout' });
    expect(aborted).toBe(true);
  });

  it('retries a network error then succeeds', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () => Promise.reject(new Error('connection reset')),
      () => Promise.resolve(new Response('ok', { status: 200 })),
    ]);
    const res = await fetchWithRetry('https://x/', {}, deps(fetchImpl), fastOptions);
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it('keeps the original fetch error as the cause of a network UpstreamError', async () => {
    // Node's fetch throws a TypeError whose real reason (DNS, TLS, refused)
    // sits on its own `cause`. The proxy must preserve it so logs can show it.
    const underlying = new TypeError('fetch failed');
    (underlying as { cause?: unknown }).cause = Object.assign(
      new Error('getaddrinfo ENOTFOUND web.archive.org'),
      { code: 'ENOTFOUND' },
    );
    const { fetchImpl } = scriptedFetch([() => Promise.reject(underlying)]);
    await expect(
      fetchWithRetry('https://x/', {}, deps(fetchImpl), {
        ...fastOptions,
        maxAttempts: 1,
      }),
    ).rejects.toMatchObject({ kind: 'network', cause: underlying });
  });
});

describe('logProxyFailure', () => {
  it('logs an UpstreamError with its kind, status, and nested cause', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const cause = Object.assign(new Error('getaddrinfo ENOTFOUND'), {
        code: 'ENOTFOUND',
      });
      logProxyFailure(
        'cdx',
        new UpstreamError('network', 'Network error contacting upstream', undefined, cause),
      );
      expect(spy).toHaveBeenCalledTimes(1);
      const detail = spy.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(detail).toMatchObject({ scope: 'cdx', kind: 'network' });
      expect(detail.cause).toMatchObject({ code: 'ENOTFOUND' });
    } finally {
      spy.mockRestore();
    }
  });

  it('logs a plain Error with its name, message, and cause', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const err = new TypeError('fetch failed');
      (err as { cause?: unknown }).cause = Object.assign(new Error('socket hang up'), {
        code: 'ECONNRESET',
      });
      logProxyFailure('swf', err);
      const detail = spy.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(detail).toMatchObject({ scope: 'swf', name: 'TypeError' });
      expect(detail.cause).toMatchObject({ message: 'socket hang up', code: 'ECONNRESET' });
    } finally {
      spy.mockRestore();
    }
  });
});

describe('parseRetryAfter', () => {
  it('reads an integer number of seconds', () => {
    expect(parseRetryAfter('3')).toBe(3000);
  });

  it('reads an HTTP date relative to now', () => {
    const now = Date.parse('2020-01-01T00:00:00Z');
    const later = new Date(now + 5000).toUTCString();
    expect(parseRetryAfter(later, now)).toBe(5000);
  });

  it('returns null when absent or unparseable', () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('soon')).toBeNull();
  });
});

describe('toRequestUrl', () => {
  it('parses an absolute request.url (the Edge runtime shape)', () => {
    const url = toRequestUrl(new Request('https://seance.example/api/cdx?url=x'));
    expect(url.pathname).toBe('/api/cdx');
    expect(url.searchParams.get('url')).toBe('x');
  });

  it('parses a path-only request.url (the Node.js runtime adapter shape)', () => {
    // Vercel's Node.js adapter sets request.url to a path+query, which
    // `new URL()` alone rejects with ERR_INVALID_URL. A bare object stands in
    // for the request because undici's Request constructor needs an absolute
    // URL and so cannot build this shape directly.
    const url = toRequestUrl({ url: '/api/cdx?url=http%3A%2F%2Fa.test%2F' } as Request);
    expect(url.pathname).toBe('/api/cdx');
    expect(url.searchParams.get('url')).toBe('http://a.test/');
  });
});

describe('statusForUpstreamError', () => {
  it('maps each kind to an HTTP status', () => {
    expect(statusForUpstreamError(new UpstreamError('rate-limited', ''))).toBe(429);
    expect(statusForUpstreamError(new UpstreamError('timeout', ''))).toBe(504);
    expect(statusForUpstreamError(new UpstreamError('server-error', ''))).toBe(502);
    expect(statusForUpstreamError(new UpstreamError('network', ''))).toBe(502);
    expect(statusForUpstreamError(new UpstreamError('client-error', ''))).toBe(400);
  });
});

describe('DEFAULT_RETRY_OPTIONS worst-case wait (R8.9)', () => {
  it('bounds a single proxy request well under the ~20s recovery deadline', () => {
    const o = DEFAULT_RETRY_OPTIONS;
    // Worst case: every attempt times out, with a capped backoff between them.
    const worst = o.maxAttempts * o.timeoutMs + (o.maxAttempts - 1) * o.maxDelayMs;
    expect(worst).toBeLessThanOrEqual(20000);
    // A sustained 429 must surface in a couple of seconds, not tens: few
    // attempts and a short backoff ceiling.
    expect(o.maxAttempts).toBeLessThanOrEqual(2);
    expect(o.maxDelayMs).toBeLessThanOrEqual(2000);
  });
});
