// A tiny in-memory cache of CDX answers, keyed by the queried original URL.
//
// It holds parsed `Capture[]` for the session so a repeated lookup of the same
// URL makes no new archive request (requirements R8.8). The cache is ephemeral
// and keyed only by the URL — no user identity, nothing durable — so it does
// not breach R9.5. Only successful lookups are stored (see cdx-client), so a
// transient failure can still be retried.

import type { Capture } from '../core/types.js';

export interface CdxCache {
  get(url: string): Capture[] | undefined;
  set(url: string, captures: Capture[]): void;
}

/** A cache backed by a plain `Map`, living as long as its owner keeps it. */
export function createCdxCache(): CdxCache {
  const store = new Map<string, Capture[]>();
  return {
    get: (url) => store.get(url),
    set: (url, captures) => {
      store.set(url, captures);
    },
  };
}
