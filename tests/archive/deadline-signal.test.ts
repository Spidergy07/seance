// Task 33 (R8.9): the archive clients thread the recovery's deadline
// `AbortSignal` into every fetch, and an abort surfaces as the `timeout` client
// error so the shell can show the timeout state instead of spinning.

import { describe, it, expect } from 'vitest';
import { fetchCaptures } from '../../src/archive/cdx-client.js';
import { fetchSnapshot } from '../../src/archive/snapshot-client.js';

function abortError(): Error {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}

describe('cdx-client honours the deadline signal', () => {
  it('passes the signal to fetch', async () => {
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    const fetchImpl = (async (_url: string, init: RequestInit = {}) => {
      seen = init.signal ?? undefined;
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    await fetchCaptures('http://x/', { fetch: fetchImpl, signal: controller.signal });
    expect(seen).toBe(controller.signal);
  });

  it('maps an aborted fetch to the timeout error', async () => {
    const fetchImpl = (async () => {
      throw abortError();
    }) as unknown as typeof fetch;
    const result = await fetchCaptures('http://x/', { fetch: fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('timeout');
    }
  });
});

describe('snapshot-client honours the deadline signal', () => {
  it('passes the signal to fetch', async () => {
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    const fetchImpl = (async (_url: string, init: RequestInit = {}) => {
      seen = init.signal ?? undefined;
      return new Response('<html></html>', { status: 200 });
    }) as unknown as typeof fetch;

    await fetchSnapshot('http://x/', '20080303120000', {
      fetch: fetchImpl,
      signal: controller.signal,
    });
    expect(seen).toBe(controller.signal);
  });

  it('maps an aborted fetch to the timeout error', async () => {
    const fetchImpl = (async () => {
      throw abortError();
    }) as unknown as typeof fetch;
    const result = await fetchSnapshot('http://x/', '20080303120000', { fetch: fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('timeout');
    }
  });
});
