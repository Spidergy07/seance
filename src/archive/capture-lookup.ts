// Build a `CaptureLookup` backed by our CDX proxy. For each asset URL it asks
// the proxy for captures and picks the most recent working one. This is the
// batched CDX lookup the recovery accounting uses (design.md §3 step 6).
//
// Convention (see core/types CaptureLookup): a URL the archive has a working
// capture for maps to that `Capture`; a URL with no working capture maps to
// `null` (missing); a URL whose lookup failed is left absent (unknown), so a
// transient error is never reported as a confirmed miss.

import { selectBest } from '../core/capture-select.js';
import type { Capture, CaptureLookup } from '../core/types.js';
import { fetchCaptures } from './cdx-client.js';
import type { ArchiveClientDeps } from './cdx-client.js';

export interface CaptureLookupOptions {
  /** Maximum concurrent CDX requests. Defaults to 6. */
  concurrency?: number;
}

/** Run `task` over `items` with a bounded number in flight at once. */
async function mapLimited<T>(
  items: readonly string[],
  limit: number,
  task: (item: string) => Promise<T>,
): Promise<void> {
  let next = 0;
  const workers: Promise<void>[] = [];
  const run = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item !== undefined) {
        await task(item);
      }
    }
  };
  const count = Math.max(1, Math.min(limit, items.length));
  for (let i = 0; i < count; i += 1) {
    workers.push(run());
  }
  await Promise.all(workers);
}

/**
 * A `CaptureLookup` that queries the CDX proxy for each URL. Successful lookups
 * with a working capture map to that capture; successful lookups with no
 * working capture map to `null`; failed lookups are omitted (unknown).
 */
export function createCaptureLookup(
  deps: ArchiveClientDeps,
  options: CaptureLookupOptions = {},
): CaptureLookup {
  const concurrency = options.concurrency ?? 6;
  return async (urls) => {
    const result = new Map<string, Capture | null>();
    await mapLimited([...urls], concurrency, async (url) => {
      const captures = await fetchCaptures(url, deps);
      if (!captures.ok) {
        return; // leave absent: undetermined → unknown
      }
      result.set(url, selectBest(captures.value));
    });
    return result;
  };
}
