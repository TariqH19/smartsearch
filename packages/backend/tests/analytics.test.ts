import { describe, expect, it, vi } from "vitest";
import supertest from "supertest";
import { createApp } from "../src/app.js";
import { parseAnalyticsDays } from "../src/search/analytics-query.js";
import {
  SEARCH_EVENT_INDEXES,
  buildAnalyticsOverviewPipeline,
  createSearchAnalyticsIndexes,
} from "../src/search/analytics-repository.js";
import {
  createSearchEvent,
  normalizeSearchQuery,
  type SearchEvent,
} from "../src/search/analytics.js";
import { createAnalyticsService } from "../src/search/analytics-service.js";
import { createSearchRouter } from "../src/routes/search.js";

const request = supertest;

class FakeAnalyticsCollection {
  readonly createdIndexes: Array<{ keys: unknown; options: unknown }> = [];
  readonly documents: SearchEvent[] = [];

  async createIndex(keys: unknown, options: unknown): Promise<string> {
    this.createdIndexes.push({ keys, options });
    return (options as { name: string }).name;
  }

  async insertOne(event: SearchEvent): Promise<void> {
    this.documents.push(event);
  }

  async indexes(): Promise<Array<{ name: string; key: Record<string, number>; expireAfterSeconds?: number | null }>> {
    return this.createdIndexes.map(({ keys, options }) => ({
      name: (options as { name: string }).name,
      key: keys as Record<string, number>,
      expireAfterSeconds: (options as { expireAfterSeconds?: number }).expireAfterSeconds,
    }));
  }

  aggregate() {
    return {
      toArray: async () => [
        {
          summary: [
            {
              totalSearchRequests: 2,
              zeroResultRequests: 1,
              categoryFilterRequests: 1,
              tagFilterRequests: 2,
            },
          ],
          engineUsage: [
            { _id: "baseline", requestCount: 1 },
            { _id: "atlas", requestCount: 1 },
          ],
          latencyByEngine: [
            { _id: "baseline", requestCount: 1, averageTookMs: 320 },
            { _id: "atlas", requestCount: 1, averageTookMs: 610 },
          ],
          topQueries: [
            { _id: "mongodb", requestCount: 9 },
            { _id: "atlas search", requestCount: 3 },
          ],
          dailyVolume: [{ _id: new Date("2026-03-10T00:00:00.000Z"), requestCount: 2 }],
          categoryUsage: [{ _id: "data", requestCount: 1 }],
          tagUsage: [{ _id: "mongodb", requestCount: 2 }],
        },
      ],
    };
  }
}

describe("normalizeSearchQuery", () => {
  it("normalizes, redacts, and truncates search terms", () => {
    const q = "  Contact Jane.Smith@example.com and +1 (415) 555-1234 now  ";
    const result = normalizeSearchQuery(q);

    expect(result).toBeTruthy();
    expect(result).toContain("[email]");
    expect(result).toContain("[phone]");
    expect(result).toMatch(/^contact /);
    expect(result).toHaveLength(Math.min(result?.length ?? 0, 120));
  });

  it("returns null for empty or whitespace-only values", () => {
    expect(normalizeSearchQuery("   ")).toBeNull();
    expect(normalizeSearchQuery("")).toBeNull();
  });

  it("truncates long queries to 120 characters", () => {
    const longQuery = "mongo " + "database ".repeat(1000);
    const result = normalizeSearchQuery(longQuery);

    expect(result).not.toBeNull();
    expect(result?.length).toBeLessThanOrEqual(120);
  });
});

describe("createSearchEvent", () => {
  it("captures search metadata and filter usage", () => {
    const event = createSearchEvent({
      engine: "atlas",
      query: " MongoDB Atlas Search ",
      resultCount: 42,
      tookMs: 220,
      category: "data",
      tags: ["mongodb", "atlas"],
      facetsRequested: true,
    });

    expect(event.engine).toBe("atlas");
    expect(event.normalizedQuery).toBe("mongodb atlas search");
    expect(event.resultCount).toBe(42);
    expect(event.tookMs).toBe(220);
    expect(event.category).toBe("data");
    expect(event.tags).toEqual(["mongodb", "atlas"]);
    expect(event.categoryFilterApplied).toBe(true);
    expect(event.tagFilterApplied).toBe(true);
    expect(event.facetsRequested).toBe(true);
  });
});

describe("parseAnalyticsDays", () => {
  it("accepts valid boundaries and default value", () => {
    expect(parseAnalyticsDays({})).toEqual({ ok: true, days: 7 });
    expect(parseAnalyticsDays({ days: "1" })).toEqual({ ok: true, days: 1 });
    expect(parseAnalyticsDays({ days: "30" })).toEqual({ ok: true, days: 30 });
  });

  it("rejects out-of-range values", () => {
    expect(parseAnalyticsDays({ days: "0" })).toMatchObject({ ok: false });
    expect(parseAnalyticsDays({ days: "31" })).toMatchObject({ ok: false });
    expect(parseAnalyticsDays({ days: "abc" })).toMatchObject({ ok: false });
  });
});

describe("createAnalyticsService", () => {
  it("syncs the repository result and records failures without throwing", async () => {
    const warn = vi.fn();
    const repository = {
      overview: vi.fn(async () => ({
        summary: { totalSearchRequests: 0, zeroResultRequests: 0 },
        engineUsage: [],
        latencyByEngine: [],
        topQueries: [],
        dailyVolume: [],
        filterUsage: {
          categoryFilterRequests: 0,
          tagFilterRequests: 0,
          categories: [],
          tags: [],
        },
      })),
      record: vi.fn(async () => {
        throw new Error("insert failed");
      }),
    };

    const service = createAnalyticsService(repository, { logger: { warn, error: vi.fn() } });
    service.recordSearchEvent(
      createSearchEvent({
        engine: "baseline",
        query: "mongo",
        resultCount: 1,
        tookMs: 12,
        tags: [],
      })
    );

    await Promise.resolve();
    expect(warn).toHaveBeenCalledTimes(1);
    await expect(service.overview(7)).resolves.toMatchObject({ range: { days: 7 } });
  });

  it("redacts public query names while preserving aggregate counts", async () => {
    const repository = {
      overview: vi.fn(async () => ({
        summary: { totalSearchRequests: 12, zeroResultRequests: 3 },
        engineUsage: [
          { engine: "baseline", requestCount: 8 },
          { engine: "atlas", requestCount: 4 },
        ],
        latencyByEngine: [
          { engine: "baseline", requestCount: 8, averageTookMs: 220 },
          { engine: "atlas", requestCount: 4, averageTookMs: 460 },
        ],
        topQueries: [{ query: "mongodb atlas search", requestCount: 4 }],
        dailyVolume: [{ date: "2026-03-10", requestCount: 12 }],
        filterUsage: {
          categoryFilterRequests: 2,
          tagFilterRequests: 3,
          categories: [{ value: "data", requestCount: 2 }],
          tags: [{ value: "mongodb", requestCount: 3 }],
        },
      })),
      record: vi.fn(async () => undefined),
    };

    const service = createAnalyticsService(repository, {
      logger: { warn: vi.fn(), error: vi.fn() },
    });

    const overview = await service.overview(7);

    expect(overview.topQueries).toEqual([{ query: "[private query]", requestCount: 4 }]);
    expect(overview.topQueries[0].query).not.toContain("mongodb");
    expect(overview.summary.totalSearchRequests).toBe(12);
  });
});

describe("analytics repository", () => {
  it("declares the required TTL index definition", () => {
    expect(SEARCH_EVENT_INDEXES).toHaveLength(1);
    expect(SEARCH_EVENT_INDEXES[0]).toMatchObject({
      name: "occurredAt_ttl_30d",
      expireAfterSeconds: 30 * 24 * 60 * 60,
    });
  });

  it("builds an overview pipeline with facet-driven aggregation", () => {
    const pipeline = buildAnalyticsOverviewPipeline({
      from: new Date("2026-03-01T00:00:00.000Z"),
      to: new Date("2026-03-08T00:00:00.000Z"),
    });

    expect(pipeline).toHaveLength(2);
    expect(pipeline[0]).toMatchObject({ $match: { occurredAt: { $gte: expect.any(Date), $lt: expect.any(Date) } } });
    expect(pipeline[1]).toHaveProperty("$facet");
    expect(Object.keys((pipeline[1] as { $facet: Record<string, unknown> }).$facet)).toEqual(
      expect.arrayContaining(["summary", "engineUsage", "latencyByEngine", "topQueries", "dailyVolume", "categoryUsage", "tagUsage"])
    );
  });

  it("creates and verifies the TTL index via the repository helper", async () => {
    const collection = new FakeAnalyticsCollection();
    const db = { collection: () => collection } as never;

    const names = await createSearchAnalyticsIndexes(db);

    expect(names).toEqual(SEARCH_EVENT_INDEXES.map((index) => index.name));
    expect(collection.createdIndexes).toHaveLength(1);
  });
});

describe("search route analytics integration", () => {
  it("records successful search requests but not autocomplete requests", async () => {
    const recordSearchEvent = vi.fn();
    const app = createApp({
      searchRouter: createSearchRouter({
        service: {
          search: async () => ({
            results: [],
            meta: { total: 7, tookMs: 42 },
          }),
        } as never,
        advanced: {
          suggest: async () => ({ suggestions: [] }),
        } as never,
        analytics: { recordSearchEvent } as never,
      }),
    });

    await request(app).get("/api/search?q=atlas");
    await request(app).get("/api/search/suggest?q=at");

    await new Promise((resolve) => setImmediate(resolve));

    expect(recordSearchEvent).toHaveBeenCalledTimes(1);
  });

  it("does not fail the search response when analytics persistence fails", async () => {
    const recordSearchEvent = vi.fn(() => {
      throw new Error("write failed");
    });
    const app = createApp({
      searchRouter: createSearchRouter({
        service: {
          search: async () => ({
            results: [],
            meta: { total: 0, tookMs: 9 },
          }),
        } as never,
        analytics: { recordSearchEvent } as never,
      }),
    });

    const res = await request(app).get("/api/search?q=atlas");
    await new Promise((resolve) => setImmediate(resolve));

    expect(res.status).toBe(200);
    expect(recordSearchEvent).toHaveBeenCalledTimes(1);
  });
});
