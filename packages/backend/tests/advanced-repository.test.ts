import { describe, expect, it } from "vitest";
import {
  buildSearchMetaStage,
  buildSearchPipeline,
  buildSearchStage,
  createAdvancedSearchRepository,
} from "../src/search/advanced-repository.js";
import {
  buildFacetMetaStage,
  createFacetRepository,
} from "../src/search/facet-repository.js";
import {
  buildSuggestPipeline,
  buildSuggestStage,
  createSuggestRepository,
  toUniqueTitles,
} from "../src/search/suggest-repository.js";
import { MIN_SUGGEST_LENGTH } from "../src/search/suggest-query.js";
import type { AdvancedSearchParams } from "../src/search/advanced-query.js";
import type { Db } from "mongodb";
import { ATLAS_SEARCH_INDEX_NAME } from "../src/search/atlas-index.js";

function params(overrides: Partial<AdvancedSearchParams> = {}): AdvancedSearchParams {
  return {
    q: "pipeline",
    tags: [],
    page: 1,
    pageSize: 20,
    fuzzy: true,
    fuzzyMaxEdits: 1,
    fuzzyPrefixLength: 0,
    ...overrides,
  };
}

describe("buildSearchStage", () => {
  it("targets the documents_search index", () => {
    expect(buildSearchStage(params()).index).toBe(ATLAS_SEARCH_INDEX_NAME);
  });

  it("uses a text operator with fuzzy matching", () => {
    const stage = buildSearchStage(params()) as {
      compound: { must: Array<{ text?: { fuzzy?: unknown } }> };
    };

    const text = stage.compound.must[0]?.text;
    expect(text?.fuzzy).toEqual({ maxEdits: 1, prefixLength: 0 });
  });

  it("omits fuzzy when disabled", () => {
    const stage = buildSearchStage(params({ fuzzy: false })) as {
      compound: { must: Array<{ text?: { fuzzy?: unknown } }> };
    };

    expect(stage.compound.must[0]?.text?.fuzzy).toBeUndefined();
  });

  it("uses match_all when the query is empty", () => {
    const stage = buildSearchStage(params({ q: "" })) as {
      compound: { must: Array<Record<string, unknown>> };
    };

    expect(stage.compound.must[0]).toEqual({ match_all: {} });
  });

  it("adds category and tag filters to the compound filter", () => {
    const stage = buildSearchStage(
      params({ category: "data", tags: ["mongodb", "aggregation"] })
    ) as {
      compound: { filter?: Array<{ text: { query: unknown; path: string } }> };
    };

    // One clause per tag keeps AND semantics across the filter array.
    expect(stage.compound.filter).toEqual([
      { text: { query: "data", path: "category" } },
      { text: { query: "mongodb", path: "tags" } },
      { text: { query: "aggregation", path: "tags" } },
    ]);
  });

  it("omits the filter array when there are no filters", () => {
    const stage = buildSearchStage(params()) as { compound: { filter?: unknown } };
    expect(stage.compound.filter).toBeUndefined();
  });

  it("never lets a query string become an operator", () => {
    const stage = buildSearchStage(params({ q: '{"$ne": null}' })) as {
      compound: { must: Array<{ text?: { query: unknown } }> };
    };

    // The query is passed as data under `text.query`, never as a filter key.
    expect(stage.compound.must[0]?.text?.query).toBe('{"$ne": null}');
  });
});

describe("buildSearchPipeline", () => {
  it("computes skip from page and pageSize", () => {
    const pipeline = buildSearchPipeline(params({ page: 3, pageSize: 25 }), "idx", { _id: 1 });
    const skip = pipeline.find((stage) => "$skip" in stage) as { $skip: number };

    expect(skip.$skip).toBe(50);
  });

  it("limits to pageSize", () => {
    const pipeline = buildSearchPipeline(params({ pageSize: 10 }), "idx", { _id: 1 });
    const limit = pipeline.find((stage) => "$limit" in stage) as { $limit: number };

    expect(limit.$limit).toBe(10);
  });

  it("adds a score field via $meta searchScore", () => {
    const pipeline = buildSearchPipeline(params(), "idx", { _id: 1 });
    const addFields = pipeline.find((stage) => "$addFields" in stage) as {
      $addFields: Record<string, unknown>;
    };

    expect(addFields.$addFields._score).toEqual({ $meta: "searchScore" });
  });

  it("passes the index name into the $search stage", () => {
    const pipeline = buildSearchPipeline(params(), "custom_index", { _id: 1 });
    const search = pipeline[0] as { $search: { index: string } };

    expect(search.$search.index).toBe("custom_index");
  });
});

describe("buildSearchMetaStage", () => {
  it("requests a total count", () => {
    const stage = buildSearchMetaStage(params()) as { count: { type: string } };
    expect(stage.count).toEqual({ type: "total" });
  });
});

describe("createAdvancedSearchRepository", () => {
  it("returns hits with score extracted from _score", async () => {
    // First aggregate call returns documents, second returns meta.
    let call = 0;
    const db = {
      collection: () => ({
        aggregate: () => ({
          toArray: async () => {
            call += 1;
            return call === 1
              ? [
                  { _id: "a", title: "One", _score: 2.5 },
                  { _id: "b", title: "Two", _score: 1.5 },
                ]
              : [{ count: { total: 42 } }];
          },
        }),
      }),
    } as unknown as Db;

    const repository = createAdvancedSearchRepository(db);
    const page = await repository.search(params());

    expect(page.total).toBe(42);
    expect(page.hits).toHaveLength(2);
    expect(page.hits[0]).toEqual({ document: { _id: "a", title: "One" }, score: 2.5 });
  });

  it("defaults total to the returned count when meta is missing", async () => {
    let call = 0;
    const db = {
      collection: () => ({
        aggregate: () => ({
          toArray: async () => {
            call += 1;
            return call === 1 ? [{ _id: "a", title: "One", _score: 1 }] : [];
          },
        }),
      }),
    } as unknown as Db;

    const repository = createAdvancedSearchRepository(db);
    const page = await repository.search(params());

    expect(page.total).toBe(1);
  });

  it("never returns _score inside the document payload", async () => {
    let call = 0;
    const db = {
      collection: () => ({
        aggregate: () => ({
          toArray: async () => {
            call += 1;
            return call === 1 ? [{ _id: "a", title: "One", _score: 9 }] : [{ count: { total: 1 } }];
          },
        }),
      }),
    } as unknown as Db;

    const repository = createAdvancedSearchRepository(db);
    const page = await repository.search(params());

    expect(page.hits[0]?.document).not.toHaveProperty("_score");
    expect(page.hits[0]?.score).toBe(9);
  });
});

describe("facet stage", () => {
  it("declares category and tag facets", () => {
    const stage = buildFacetMetaStage(params(), "idx", 20) as {
      facet: { facets: Record<string, unknown> };
    };

    expect(stage.facet.facets).toHaveProperty("categoryFacet");
    expect(stage.facet.facets).toHaveProperty("tagsFacet");
  });

  it("nests the query under facet.operator, not at the top level", () => {
    const stage = buildFacetMetaStage(params(), "idx", 20) as {
      compound?: unknown;
      facet: { operator: { compound: unknown } };
    };

    // A top-level `compound` next to `facet` is rejected by Atlas with
    // "Top-level operator is not allowed to be used with collector".
    expect(stage.compound).toBeUndefined();
    expect(stage.facet.operator.compound).toBeDefined();
  });

  it("passes the max bucket count", () => {
    const stage = buildFacetMetaStage(params(), "idx", 5) as {
      facet: { facets: { categoryFacet: { numBuckets: number } } };
    };

    expect(stage.facet.facets.categoryFacet.numBuckets).toBe(5);
  });

  it("targets the token-capable facet paths", () => {
    const stage = buildFacetMetaStage(params(), "idx", 20) as {
      facet: { facets: Record<string, { type: string; path: string }> };
    };

    // `type: "string"` is the facet collector's bucket type; `path` must name a
    // field the index maps as `token`.
    expect(stage.facet.facets.categoryFacet).toMatchObject({
      type: "string",
      path: "category",
    });
    expect(stage.facet.facets.tagsFacet).toMatchObject({
      type: "string",
      path: "tags",
    });
  });

  it("applies the same filters as the main search", () => {
    const stage = buildFacetMetaStage(
      params({ category: "data", tags: ["analytics", "migration"] }),
      "idx",
      20
    ) as {
      facet: { operator: { compound: { filter: unknown[] } } };
    };

    expect(stage.facet.operator.compound.filter).toEqual([
      { text: { query: "data", path: "category" } },
      { text: { query: "analytics", path: "tags" } },
      { text: { query: "migration", path: "tags" } },
    ]);
  });

  it("uses match_all for an empty query", () => {
    const stage = buildFacetMetaStage(params({ q: "" }), "idx", 20) as {
      facet: { operator: { compound: { must: unknown[] } } };
    };

    expect(stage.facet.operator.compound.must).toEqual([{ match_all: {} }]);
  });

  it("reports category buckets", async () => {
    const db = {
      collection: () => ({
        aggregate: () => ({
          toArray: async () => [
            {
              facet: {
                categoryFacet: {
                  buckets: [
                    { _id: "engineering", count: 34 },
                    { _id: "data", count: 34 },
                    { _id: "design", count: 33 },
                  ],
                },
                tagsFacet: { buckets: [] },
              },
            },
          ],
        }),
      }),
    } as unknown as Db;

    const result = await createFacetRepository(db).facets(params());

    expect(result.category).toEqual([
      { value: "engineering", count: 34 },
      { value: "data", count: 34 },
      { value: "design", count: 33 },
    ]);
    expect(result.tags).toEqual([]);
  });

  it("reports tag buckets", async () => {
    const db = {
      collection: () => ({
        aggregate: () => ({
          toArray: async () => [
            {
              facet: {
                categoryFacet: { buckets: [] },
                tagsFacet: {
                  buckets: [
                    { _id: "analytics", count: 19 },
                    { _id: "threat-modeling", count: 22 },
                    { _id: "metrics", count: 19 },
                  ],
                },
              },
            },
          ],
        }),
      }),
    } as unknown as Db;

    const result = await createFacetRepository(db).facets(params());

    expect(result.category).toEqual([]);
    expect(result.tags).toEqual([
      { value: "threat-modeling", count: 22 },
      { value: "analytics", count: 19 },
      { value: "metrics", count: 19 },
    ]);
  });

  it("returns both facets for a combined query and filters", async () => {
    const db = {
      collection: () => ({
        aggregate: () => ({
          toArray: async () => [
            {
              facet: {
                categoryFacet: { buckets: [{ _id: "data", count: 5 }] },
                tagsFacet: { buckets: [{ _id: "analytics", count: 2 }] },
              },
            },
          ],
        }),
      }),
    } as unknown as Db;

    const result = await createFacetRepository(db).facets(
      params({ q: "pipelines", category: "data", tags: ["analytics"] })
    );

    expect(result.category).toEqual([{ value: "data", count: 5 }]);
    expect(result.tags).toEqual([{ value: "analytics", count: 2 }]);
  });

  it("returns empty facets when Atlas reports no facet data", async () => {
    const db = {
      collection: () => ({
        aggregate: () => ({ toArray: async () => [{}] }),
      }),
    } as unknown as Db;

    const result = await createFacetRepository(db).facets(params());

    expect(result).toEqual({ category: [], tags: [] });
  });

  it("propagates Atlas errors so the service can map them to 503", async () => {
    const atlasError = new Error(
      'Cannot facet on field "category" because it was not indexed as a "token" field'
    );
    const db = {
      collection: () => ({
        aggregate: () => ({
          toArray: async () => {
            throw atlasError;
          },
        }),
      }),
    } as unknown as Db;

    await expect(createFacetRepository(db).facets(params())).rejects.toThrow(
      atlasError
    );
  });

  it("sorts buckets by count descending and drops malformed entries", async () => {
    const db = {
      collection: () => ({
        aggregate: () => ({
          toArray: async () => {
            return [
              {
                facet: {
                  categoryFacet: {
                    buckets: [
                      { _id: "data", count: 3 },
                      { _id: "design", count: 9 },
                      { _id: 7, count: 1 },
                      { _id: "tags" },
                    ],
                  },
                  tagsFacet: { buckets: [{ _id: "mongodb", count: 4 }] },
                },
              },
            ];
          },
        }),
      }),
    } as unknown as Db;

    const repository = createFacetRepository(db);
    const result = await repository.facets(params());

    expect(result.category).toEqual([
      { value: "design", count: 9 },
      { value: "data", count: 3 },
    ]);
    expect(result.tags).toEqual([{ value: "mongodb", count: 4 }]);
  });

  it("returns empty facets when the response has no facet data", async () => {
    const db = {
      collection: () => ({
        aggregate: () => ({ toArray: async () => [{}] }),
      }),
    } as unknown as Db;

    const repository = createFacetRepository(db);
    const result = await repository.facets(params());

    expect(result).toEqual({ category: [], tags: [] });
  });
});

describe("autocomplete stage", () => {
  it("uses the autocomplete operator on the title path", () => {
    const stage = buildSuggestStage({ q: "mon", limit: 5 }, "idx") as {
      autocomplete: { query: string; path: string };
    };

    expect(stage.autocomplete.query).toBe("mon");
    expect(stage.autocomplete.path).toBe("title");
  });

  it("groups by title so duplicate titles collapse", () => {
    const pipeline = buildSuggestPipeline({ q: "mon", limit: 3 }, "idx");
    const group = pipeline.find((s) => "$group" in s) as {
      $group: { _id: string; title: { $first: string } };
    };

    expect(group.$group._id).toBe("$title");
    expect(group.$group.title).toEqual({ $first: "$title" });
  });

  it("orders by relevance before and after grouping", () => {
    const pipeline = buildSuggestPipeline({ q: "mon", limit: 3 }, "idx");
    const sorts = pipeline
      .filter((s) => "$sort" in s)
      .map((s) => (s as { $sort: Record<string, number> }).$sort);

    expect(sorts).toEqual([{ _suggestScore: -1 }, { _suggestScore: -1 }]);
  });

  it("applies the limit after grouping", () => {
    const pipeline = buildSuggestPipeline({ q: "mon", limit: 3 }, "idx");
    const names = pipeline.map((s) => Object.keys(s)[0]);

    expect(names.indexOf("$group")).toBeLessThan(names.indexOf("$limit"));
    const limit = pipeline.find((s) => "$limit" in s) as { $limit: number };
    expect(limit.$limit).toBe(3);
  });

  it("projects only the title", () => {
    const pipeline = buildSuggestPipeline({ q: "mon", limit: 3 }, "idx");
    const project = pipeline.find((s) => "$project" in s) as {
      $project: Record<string, number>;
    };

    expect(project.$project).toEqual({ _id: 0, title: 1 });
  });

  it("makes exactly one database call per suggestion request", async () => {
    let calls = 0;
    const db = {
      collection: () => ({
        aggregate: () => {
          calls += 1;
          return { toArray: async () => [] };
        },
      }),
    } as unknown as Db;

    await createSuggestRepository(db).suggest({ q: "mon", limit: 5 });

    expect(calls).toBe(1);
  });

  it("extracts string titles and skips malformed rows", async () => {
    const db = {
      collection: () => ({
        aggregate: () => ({
          toArray: async () => [
            { title: "MongoDB Aggregation" },
            { title: "" },
            { title: 42 },
            { other: "x" },
          ],
        }),
      }),
    } as unknown as Db;

    const repository = createSuggestRepository(db);
    const suggestions = await repository.suggest({ q: "mon", limit: 5 });

    expect(suggestions).toEqual(["MongoDB Aggregation"]);
  });

  it("drops duplicate titles while preserving order", async () => {
    const db = {
      collection: () => ({
        aggregate: () => ({
          toArray: async () => [
            { title: "Rethinking threat modelling" },
            { title: "Understanding threat modelling" },
            { title: "Rethinking threat modelling" },
            { title: "threat modelling: Patterns and Pitfalls" },
            { title: "Rethinking threat modelling" },
          ],
        }),
      }),
    } as unknown as Db;

    const suggestions = await createSuggestRepository(db).suggest({
      q: "mon",
      limit: 10,
    });

    expect(suggestions).toEqual([
      "Rethinking threat modelling",
      "Understanding threat modelling",
      "threat modelling: Patterns and Pitfalls",
    ]);
    expect(new Set(suggestions).size).toBe(suggestions.length);
  });

  it("keeps the first occurrence of a duplicate", () => {
    expect(
      toUniqueTitles([
        { title: "A" },
        { title: "B" },
        { title: "A" },
      ])
    ).toEqual(["A", "B"]);
  });

  it("returns an empty list for empty or malformed input", () => {
    expect(toUniqueTitles([])).toEqual([]);
    expect(toUniqueTitles([{ title: "" }, { title: 1 }, null])).toEqual([]);
  });

  it("exports the minimum suggest length constant", () => {
    expect(MIN_SUGGEST_LENGTH).toBe(2);
  });
});