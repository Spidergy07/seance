import { describe, it, expect } from 'vitest';
import {
  UpstreamError,
  fetchWithRetry,
  parseRetryAfter,
  statusForUpstreamError,
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

describe('statusForUpstreamError', () => {
  it('maps each kind to an HTTP status', () => {
    expect(statusForUpstreamError(new UpstreamError('rate-limited', ''))).toBe(429);
    expect(statusForUpstreamError(new UpstreamError('timeout', ''))).toBe(504);
    expect(statusForUpstreamError(new UpstreamError('server-error', ''))).toBe(502);
    expect(statusForUpstreamError(new UpstreamError('network', ''))).toBe(502);
    expect(statusForUpstreamError(new UpstreamError('client-error', ''))).toBe(400);
  });
});
