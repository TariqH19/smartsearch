import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { createIndexStatusProbe } from "../src/search/atlas-status.js";

function dbWithSearchIndexes(
  indexes: Array<{ name?: string; queryable?: boolean }>
): Db {
  return {
    collection: () => ({
      listSearchIndexes: () => ({
        toArray: async () => indexes,
      }),
    }),
  } as unknown as Db;
}

describe("createIndexStatusProbe", () => {
  it("reports queryable when the index exists and is ready", async () => {
    const probe = createIndexStatusProbe(
      dbWithSearchIndexes([{ name: "documents_search", queryable: true }])
    );

    await expect(probe.status("documents_search")).resolves.toEqual({
      exists: true,
      queryable: true,
    });
  });

  it("reports not queryable when the index exists but is still building", async () => {
    const probe = createIndexStatusProbe(
      dbWithSearchIndexes([{ name: "documents_search", queryable: false }])
    );

    await expect(probe.status("documents_search")).resolves.toEqual({
      exists: true,
      queryable: false,
    });
  });

  it("reports missing when no index exists", async () => {
    const probe = createIndexStatusProbe(dbWithSearchIndexes([]));

    await expect(probe.status("documents_search")).resolves.toEqual({
      exists: false,
      queryable: false,
    });
  });

  it("caches the result within the TTL", async () => {
    let calls = 0;
    let clock = 0;
    const probe = createIndexStatusProbe(dbWithSearchIndexes([]), {
      now: () => clock,
      fetch: async () => {
        calls += 1;
        return { exists: true, queryable: true };
      },
    });

    await probe.status("documents_search");
    await probe.status("documents_search");
    expect(calls).toBe(1);

    clock = 10_000;
    await probe.status("documents_search");
    expect(calls).toBe(1);

    clock = 60_000;
    await probe.status("documents_search");
    expect(calls).toBe(2);
  });

  it("invalidates the cache on demand", async () => {
    let calls = 0;
    const probe = createIndexStatusProbe(dbWithSearchIndexes([]), {
      fetch: async () => {
        calls += 1;
        return { exists: true, queryable: true };
      },
    });

    await probe.status("documents_search");
    probe.invalidate();
    await probe.status("documents_search");

    expect(calls).toBe(2);
  });

  it("treats a probe failure as not queryable rather than throwing", async () => {
    const probe = createIndexStatusProbe(dbWithSearchIndexes([]), {
      fetch: async () => {
        throw new Error("listSearchIndexes is not supported");
      },
    });

    await expect(probe.status("documents_search")).resolves.toEqual({
      exists: false,
      queryable: false,
    });
  });

  it("caches per index name", async () => {
    let calls = 0;
    const probe = createIndexStatusProbe(dbWithSearchIndexes([]), {
      fetch: async (indexName) => {
        calls += 1;
        return { exists: true, queryable: indexName === "documents_search" };
      },
    });

    const a = await probe.status("documents_search");
    const b = await probe.status("documents_autocomplete");

    expect(a.queryable).toBe(true);
    expect(b.queryable).toBe(false);
    expect(calls).toBe(2);
  });
});