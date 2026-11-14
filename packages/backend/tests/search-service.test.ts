import { describe, expect, it } from "vitest";
import {
  buildFilter,
  buildFindOptions,
  buildProjection,
  buildSort,
} from "../src/search/repository.js";
import { DEFAULT_PROJECTION_FOR_TESTS } from "./helpers/projection.js";
import { createSearchService } from "../src/search/service.js";
import type { SearchPage } from "../src/search/repository.js";
import type { SearchQuery } from "../src/search/query.js";
import type { DocumentRecord } from "../src/models/document.js";

function query(overrides: Partial<SearchQuery> = {}): SearchQuery {
  return {
    q: "",
    tags: [],
    page: 1,
    pageSize: 20,
    sort: "created",
    ...overrides,
  };
}

function document(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    _id: "doc-0001",
    title: "Understanding aggregation pipelines",
    description: "A practical guide to aggregation pipelines in MongoDB.",
    content: "Aggregation pipelines transform documents through stages.",
    category: "data",
    tags: ["mongodb", "aggregation"],
    author: "Amara Okafor",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

describe("buildFilter", () => {
  it("returns an empty filter for a bare query", () => {
    expect(buildFilter(query())).toEqual({});
  });

  it("uses $text for the query string", () => {
    expect(buildFilter(query({ q: "mongodb index" }))).toEqual({
      $text: { $search: "mongodb index" },
    });
  });

  it("adds a category equality filter", () => {
    expect(buildFilter(query({ category: "data" }))).toEqual({ category: "data" });
  });

  it("uses $all for tag filters", () => {
    const filter = buildFilter(query({ tags: ["mongodb", "indexing"] }));
    expect(filter.tags).toEqual({ $all: ["mongodb", "indexing"] });
  });

  it("combines query, category and tags", () => {
    const filter = buildFilter(
      query({ q: "pipeline", category: "data", tags: ["aggregation"] })
    );

    expect(filter.$text).toEqual({ $search: "pipeline" });
    expect(filter.category).toBe("data");
    expect(filter.tags).toEqual({ $all: ["aggregation"] });
  });
});

describe("buildSort", () => {
  it("sorts by createdAt descending with an _id tie-breaker by default", () => {
    expect(buildSort(query())).toEqual({ createdAt: -1, _id: -1 });
  });

  it("uses textScore for relevance with a query", () => {
    expect(buildSort(query({ q: "pipeline", sort: "relevance" }))).toEqual({
      score: { $meta: "textScore" },
      createdAt: -1,
      _id: -1,
    });
  });

  it("falls back to createdAt when relevance has no query", () => {
    expect(buildSort(query({ sort: "relevance" }))).toEqual({ createdAt: -1, _id: -1 });
  });

  it("sorts by updatedAt when requested", () => {
    expect(buildSort(query({ sort: "updated" }))).toEqual({
      updatedAt: -1,
      _id: -1,
    });
  });

  it("mirrors the declared index key patterns", async () => {
    const { DOCUMENT_INDEXES } = await import("../src/db/documents.js");
    const keysOf = (name: string): unknown =>
      DOCUMENT_INDEXES.find((index) => index.name === name)?.keys;

    expect(buildSort(query())).toEqual(keysOf("createdAt_desc_id"));
    expect(buildSort(query({ sort: "updated" }))).toEqual(keysOf("updatedAt_desc_id"));
  });
});

describe("buildProjection", () => {
  it("adds the textScore field for relevance searches", () => {
    const projection = buildProjection(query({ q: "pipeline", sort: "relevance" }));

    expect(projection.score).toEqual({ $meta: "textScore" });
    expect(projection.title).toBe(1);
    expect(projection._id).toBe(1);
  });

  it("keeps the default fields when a score is added", () => {
    const projection = buildProjection(query({ q: "pipeline", sort: "relevance" }));

    for (const [field, value] of Object.entries(DEFAULT_PROJECTION_FOR_TESTS)) {
      expect(projection[field]).toBe(value);
    }
  });

  it("does not add a score for non-relevance searches", () => {
    const projection = buildProjection(query());
    expect(projection.score).toBeUndefined();
  });

  it("does not add a score when relevance has no query text", () => {
    const projection = buildProjection(query({ sort: "relevance" }));
    expect(projection.score).toBeUndefined();
  });

  it("merges a caller-supplied projection with the score field", () => {
    const custom = { title: 1, category: 1 };
    const projection = buildProjection(query({ q: "x", sort: "relevance" }), custom);

    expect(projection).toEqual({
      title: 1,
      category: 1,
      score: { $meta: "textScore" },
    });
  });
});

describe("buildFindOptions", () => {
  it("applies skip and limit from pagination", () => {
    const options = buildFindOptions(query({ page: 3, pageSize: 25 }));

    expect(options.skip).toBe(50);
    expect(options.limit).toBe(25);
  });

  it("adds the textScore projection for relevance searches", () => {
    const options = buildFindOptions(query({ q: "pipeline", sort: "relevance" }));
    const projection = options.projection as Record<string, unknown>;

    expect(projection.score).toEqual({ $meta: "textScore" });
  });

  it("omits the textScore projection for non-relevance searches", () => {
    const options = buildFindOptions(query());
    const projection = options.projection as Record<string, unknown>;

    expect(projection.score).toBeUndefined();
  });

  it("always returns a projection, never undefined", () => {
    expect(buildFindOptions(query()).projection).toBeDefined();
    expect(buildFindOptions(query({ q: "x" })).projection).toBeDefined();
  });
});

describe("createSearchService pagination metadata", () => {
  const serviceFor = (page: SearchPage, now = () => 1000) =>
    createSearchService({ search: async () => page }, { now });

  const base = query({ q: "" });

  it("reports an empty result set correctly", async () => {
    const response = await serviceFor({ hits: [], total: 0 }).search(base);

    expect(response.results).toEqual([]);
    expect(response.meta.total).toBe(0);
    expect(response.meta.totalPages).toBe(0);
    expect(response.meta.hasNextPage).toBe(false);
    expect(response.meta.hasPreviousPage).toBe(false);
  });

  it("reports no next page on the last page", async () => {
    const response = await serviceFor({ hits: [], total: 45 }).search(
      query({ q: "", page: 3, pageSize: 20 })
    );

    expect(response.meta.totalPages).toBe(3);
    expect(response.meta.hasNextPage).toBe(false);
    expect(response.meta.hasPreviousPage).toBe(true);
  });

  it("reports no previous page on the first page", async () => {
    const response = await serviceFor({ hits: [], total: 45 }).search(
      query({ q: "", page: 1, pageSize: 20 })
    );

    expect(response.meta.hasPreviousPage).toBe(false);
    expect(response.meta.hasNextPage).toBe(true);
  });

  it("handles a page beyond the last page without a next page", async () => {
    const response = await serviceFor({ hits: [], total: 5 }).search(
      query({ q: "", page: 99, pageSize: 20 })
    );

    expect(response.results).toEqual([]);
    expect(response.meta.total).toBe(5);
    expect(response.meta.totalPages).toBe(1);
    expect(response.meta.hasNextPage).toBe(false);
    expect(response.meta.hasPreviousPage).toBe(true);
  });

  it("reports totalPages 0 when pageSize is zero", async () => {
    const response = await serviceFor({ hits: [], total: 0 }).search(
      query({ q: "", pageSize: 0 })
    );

    expect(response.meta.totalPages).toBe(0);
    expect(response.meta.hasNextPage).toBe(false);
  });
});

describe("createSearchService ordering and score handling", () => {
  const serviceFor = (page: SearchPage) =>
    createSearchService({ search: async () => page }, { now: () => 1000 });

  it("preserves repository ordering for equal relevance scores", async () => {
    const hits = [
      { document: document(), score: 1.5 },
      { document: document(), score: 1.5 },
      { document: document(), score: 1.5 },
    ];
    const response = await serviceFor({ hits, total: 3 }).search(query());

    expect(response.results).toHaveLength(3);
    expect(response.results.every((hit) => hit.score === 1.5)).toBe(true);
  });

  it("keeps equal scores attached to their own documents", async () => {
    const hits = [
      { document: document({ _id: "doc-0001" }), score: 2 },
      { document: document({ _id: "doc-0002" }), score: 2 },
    ];

    const response = await serviceFor({ hits, total: 2 }).search(query());

    expect(response.results[0]?.document._id).toBe("doc-0001");
    expect(response.results[1]?.document._id).toBe("doc-0002");
  });

  it("omits score when the hit has none", async () => {
    const hits = [{ document: document({ _id: "doc-0001" }) }];
    const response = await serviceFor({ hits, total: 1 }).search(query({ q: "" }));

    expect(response.results[0]?.score).toBeUndefined();
  });

  it("strips content from every result", async () => {
    const hits = [{ document: document({ _id: "doc-0001" }), score: 1 }];
    const response = await serviceFor({ hits, total: 1 }).search(query());

    expect(response.results[0]?.document).not.toHaveProperty("content");
  });
});

describe("createSearchService error handling", () => {
  it("translates repository failures into a 503 ApiError", async () => {
    const service = createSearchService(
      {
        search: async () => {
          throw new Error("connection to cluster0-shard-00.mongodb.net failed");
        },
      },
      { now: () => 1000 }
    );

    await expect(service.search(query())).rejects.toMatchObject({
      statusCode: 503,
      message: "Search is temporarily unavailable",
    });
  });

  it("does not include driver details in the thrown error", async () => {
    const service = createSearchService(
      {
        search: async () => {
          throw new Error("Authentication failed for admin:hunter2@cluster0.mongodb.net");
        },
      },
      { now: () => 1000 }
    );

    const error = await service.search(query()).catch((e: unknown) => e);
    const serialized = JSON.stringify(error, Object.getOwnPropertyNames(error as object));

    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("cluster0");
  });
});