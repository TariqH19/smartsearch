import { describe, expect, it } from "vitest";
import supertest from "supertest";
import { createApp } from "../src/app.js";
import { createSearchRouter } from "../src/routes/search.js";
import { createAdvancedSearchService } from "../src/search/advanced-service.js";
import type {
  AdvancedSearchPage,
  AdvancedSearchRepository,
} from "../src/search/advanced-repository.js";
import type { FacetRepository } from "../src/search/facet-repository.js";
import type { SuggestRepository } from "../src/search/suggest-repository.js";
import type { AdvancedSearchParams } from "../src/search/advanced-query.js";

const request = supertest;

function repo(
  page: AdvancedSearchPage,
  error?: Error
): AdvancedSearchRepository {
  return {
    search: async (_params: AdvancedSearchParams) => {
      if (error) throw error;
      return page;
    },
  };
}

const facetRepo = (facets: { category: unknown[]; tags: unknown[] }): FacetRepository => ({
  facets: async () => facets as never,
});

const failingFacetRepo = (error: Error): FacetRepository => ({
  facets: async () => {
    throw error;
  },
});

const suggestRepo = (suggestions: string[], error?: Error): SuggestRepository => ({
  suggest: async () => {
    if (error) throw error;
    return suggestions;
  },
});

/** An index-status probe that always reports the index as ready. */
const queryableProbe = () => ({
  status: async () => ({ exists: true, queryable: true }),
  invalidate: () => undefined,
});

function app(opts: {
  search?: AdvancedSearchRepository;
  facets?: FacetRepository;
  suggest?: SuggestRepository;
  includeFacets?: boolean;
  indexStatus?: { status: () => Promise<{ exists: boolean; queryable: boolean }>; invalidate: () => void };
}) {
  const advanced = createAdvancedSearchService(
    opts.search ?? repo({ hits: [], total: 0 }),
    opts.facets,
    opts.suggest,
    {
      now: () => 1000,
      logger: { error: () => undefined },
      ...(opts.indexStatus ? { indexStatus: opts.indexStatus } : {}),
    }
  );
  return createApp({
    searchRouter: createSearchRouter({
      advanced,
      includeFacets: opts.includeFacets,
    }),
  });
}

describe("GET /api/search/advanced", () => {
  it("returns 503 when advanced search is not configured", async () => {
    const res = await request(createApp()).get("/api/search/advanced?q=x");

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("Advanced search is not configured");
  });

  it("returns 400 for invalid parameters", async () => {
    const res = await request(app({})).get("/api/search/advanced?page=0");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid search parameters");
    expect(Array.isArray(res.body.details.errors)).toBe(true);
  });

  it("returns results with scores and atlas-search engine metadata", async () => {
    const search = repo({
      hits: [{ document: { _id: "doc-1", title: "Pipeline", content: "secret" }, score: 3.2 }],
      total: 1,
    });
    const res = await request(app({ search })).get("/api/search/advanced?q=pipeline");

    expect(res.status).toBe(200);
    expect(res.body.results[0].score).toBe(3.2);
    expect(res.body.meta.engine).toBe("atlas-search");
    expect(res.body.meta.total).toBe(1);
  });

  it("strips content from advanced results", async () => {
    const search = repo({
      hits: [{ document: { _id: "doc-1", title: "Pipeline", content: "full body" }, score: 1 }],
      total: 1,
    });
    const res = await request(app({ search })).get("/api/search/advanced?q=pipeline");

    expect(res.body.results[0].document).not.toHaveProperty("content");
  });

  it("includes facets when requested with facets=true", async () => {
    const search = repo({ hits: [], total: 0 });
    const res = await request(
      app({
        search,
        facets: facetRepo({
          category: [{ value: "data", count: 34 }],
          tags: [{ value: "mongodb", count: 12 }],
        }),
      })
    ).get("/api/search/advanced?q=pipeline&facets=true");

    expect(res.status).toBe(200);
    expect(res.body.facets.category).toEqual([{ value: "data", count: 34 }]);
    expect(res.body.facets.tags).toEqual([{ value: "mongodb", count: 12 }]);
  });

  it("omits facets by default", async () => {
    const res = await request(
      app({ facets: facetRepo({ category: [], tags: [] }) })
    ).get("/api/search/advanced?q=pipeline");

    expect(res.status).toBe(200);
    expect(res.body.facets).toBeUndefined();
  });

  it("enables facets when the router default is true", async () => {
    const res = await request(
      app({
        includeFacets: true,
        facets: facetRepo({
          category: [{ value: "data", count: 34 }],
          tags: [],
        }),
      })
    ).get("/api/search/advanced?q=pipeline");

    expect(res.status).toBe(200);
    expect(res.body.facets.category).toEqual([{ value: "data", count: 34 }]);
  });

  it("returns 503 with a safe message when the facet aggregation fails", async () => {
    const res = await request(
      app({
        facets: failingFacetRepo(
          new Error(
            'Cannot facet on field "category" because it was not indexed as a "token" field'
          )
        ),
      })
    ).get("/api/search/advanced?q=pipelines&facets=true");

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("Atlas Search is unavailable");
    // The driver message must never reach the client.
    expect(JSON.stringify(res.body)).not.toContain("token");
  });

  it("still returns results when facets are not requested and would fail", async () => {
    const res = await request(
      app({
        search: repo({
          hits: [{ document: { _id: "doc-0008", title: "x" }, score: 1 }],
          total: 1,
        }),
        facets: failingFacetRepo(new Error("facet boom")),
      })
    ).get("/api/search/advanced?q=pipelines");

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.facets).toBeUndefined();
  });

  it("reports pagination metadata", async () => {
    const res = await request(
      app({ search: repo({ hits: [], total: 45 }) })
    ).get("/api/search/advanced?q=pipeline&page=2&pageSize=20");

    expect(res.body.meta.totalPages).toBe(3);
    expect(res.body.meta.hasNextPage).toBe(true);
    expect(res.body.meta.hasPreviousPage).toBe(true);
  });

  it("rejects a page beyond the depth limit", async () => {
    const res = await request(app({})).get("/api/search/advanced?q=x&page=1001");

    expect(res.status).toBe(400);
  });

  it("returns 503 when the Atlas Search index is missing", async () => {
    const error = new Error(
      "index documents_search not found: Atlas Search index does not exist"
    );
    const res = await request(
      app({ search: repo({ hits: [], total: 0 }, error) })
    ).get("/api/search/advanced?q=pipeline");

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("Atlas Search is unavailable");
    expect(JSON.stringify(res.body)).not.toMatch(/documents_search|not found/);
  });
});

describe("GET /api/search/suggest", () => {
  it("returns 503 when autocomplete is not configured", async () => {
    const res = await request(app({})).get("/api/search/suggest?q=mon");

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("Autocomplete is not configured");
  });

  it("returns suggestions", async () => {
    const res = await request(
      app({ suggest: suggestRepo(["MongoDB Aggregation", "MongoDB Indexing"]) })
    ).get("/api/search/suggest?q=mon");

    expect(res.status).toBe(200);
    expect(res.body.query).toBe("mon");
    expect(res.body.suggestions).toEqual(["MongoDB Aggregation", "MongoDB Indexing"]);
  });

  it("returns an empty list for empty input without querying", async () => {
    let called = false;
    const suggest: SuggestRepository = {
      suggest: async () => {
        called = true;
        return [];
      },
    };

    // A queryable index is available, but the short input must not reach it.
    const res = await request(
      app({ suggest, indexStatus: queryableProbe() })
    ).get("/api/search/suggest?q=");

    expect(res.status).toBe(200);
    expect(res.body.suggestions).toEqual([]);
    expect(called).toBe(false);
  });

  it("returns an empty list for a single-character query", async () => {
    const res = await request(
      app({ suggest: suggestRepo(["MongoDB"]), indexStatus: queryableProbe() })
    ).get("/api/search/suggest?q=m");

    expect(res.status).toBe(200);
    expect(res.body.suggestions).toEqual([]);
  });

  it("returns 503 when the autocomplete index is not queryable", async () => {
    const res = await request(
      app({
        suggest: suggestRepo(["MongoDB"]),
        indexStatus: {
          status: async () => ({ exists: false, queryable: false }),
          invalidate: () => undefined,
        },
      })
    ).get("/api/search/suggest?q=mon");

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("Atlas Search is unavailable");
  });

  it("rejects an invalid limit", async () => {
    const res = await request(app({ suggest: suggestRepo([]) })).get(
      "/api/search/suggest?q=mon&limit=99"
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid suggest parameters");
  });

  it("returns 503 when the autocomplete index is unavailable", async () => {
    const res = await request(
      app({ suggest: suggestRepo([], new Error("index documents_autocomplete not found")) })
    ).get("/api/search/suggest?q=mon");

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("Atlas Search is unavailable");
    expect(JSON.stringify(res.body)).not.toMatch(/documents_autocomplete|not found/);
  });
});