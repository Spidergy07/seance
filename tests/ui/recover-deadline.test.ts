// Task 33 (R8.9): a recovery runs under one deadline. When the deadline aborts,
// `recover` stops quickly with the timeout outcome rather than spinning, threads
// the deadline's signal into the archive fetch, and always clears the timer.

import { describe, it, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { recover, type RecoverDeps } from '../../src/ui/recover.js';

function abortError(): Error {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}

describe('recover under a deadline', () => {
  it('returns the timeout outcome and cancels the timer when the deadline aborts', async () => {
    const controller = new AbortController();
    controller.abort(); // the deadline has already passed
    let cancelled = false;
    let seenSignal: AbortSignal | undefined;

    const fetchImpl = (async (_url: string, init: RequestInit = {}) => {
      seenSignal = init.signal ?? undefined;
      if (init.signal?.aborted) {
        throw abortError();
      }
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const deps: RecoverDeps = {
      fetch: fetchImpl,
      parseHtml: (html) => parseHTML(html).document as unknown as Document,
      serialize: (doc) =>
        `<!doctype html>${(doc.documentElement as unknown as { outerHTML: string }).outerHTML}`,
      createDeadline: () => ({
        signal: controller.signal,
        cancel: () => {
          cancelled = true;
        },
      }),
    };

    const outcome = await recover('http://dead.example/', deps);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.kind).toBe('timeout');
    }
    expect(seenSignal).toBe(controller.signal); // the signal reached the fetch
    expect(cancelled).toBe(true); // the timer was cleared
  });
});
