import type { Db } from "mongodb";

export interface IndexStatus {
  exists: boolean;
  queryable: boolean;
}

export interface IndexStatusProbe {
  /** Returns cached status, refreshing at most once per `ttlMs`. */
  status(indexName: string): Promise<IndexStatus>;
  invalidate(): void;
}

export interface IndexStatusProbeOptions {
  ttlMs?: number;
  now?: () => number;
  /** Injectable for tests; defaults to querying `listSearchIndexes`. */
  fetch?: (indexName: string) => Promise<IndexStatus>;
}

const DEFAULT_TTL_MS = 30_000;

/**
 * Caches Atlas Search index readiness.
 *
 * Atlas Search indexes are not queryable immediately after creation, and some
 * driver/server combinations return an empty result rather than an error when
 * the index is missing. Probing explicitly lets the API answer 503
 * ("unavailable") instead of 200 ("no matches"), which is the honest signal.
 */
export function createIndexStatusProbe(
  db: Db,
  options: IndexStatusProbeOptions = {}
): IndexStatusProbe {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? (() => Date.now());

  const defaultFetch = async (indexName: string): Promise<IndexStatus> => {
    const indexes = await db.collection("documents").listSearchIndexes(indexName).toArray();
    const match = indexes.find((index) => (index as { name?: string }).name === indexName);
    if (!match) {
      return { exists: false, queryable: false };
    }
    return {
      exists: true,
      queryable: (match as { queryable?: boolean }).queryable === true,
    };
  };

  const fetch = options.fetch ?? defaultFetch;

  const cache = new Map<string, { value: IndexStatus; expiresAt: number }>();

  const status = async (indexName: string): Promise<IndexStatus> => {
    const cached = cache.get(indexName);
    if (cached && cached.expiresAt > now()) {
      return cached.value;
    }

    try {
      const value = await fetch(indexName);
      cache.set(indexName, { value, expiresAt: now() + ttlMs });
      return value;
    } catch {
      // Treat a probe failure as "not queryable" rather than crashing a search.
      return { exists: false, queryable: false };
    }
  };

  return {
    status,
    invalidate: () => cache.clear(),
  };
}