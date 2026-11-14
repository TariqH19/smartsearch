import type { Db } from "mongodb";
import type { AdvancedSearchParams } from "./advanced-query.js";
import { ATLAS_SEARCH_INDEX_NAME } from "./atlas-index.js";

export interface FacetBucket {
  value: string;
  count: number;
}

export interface FacetResult {
  category: FacetBucket[];
  tags: FacetBucket[];
}

export interface FacetRepository {
  facets(params: AdvancedSearchParams): Promise<FacetResult>;
}

export interface FacetRepositoryOptions {
  indexName?: string;
  /** Maximum buckets returned per facet. */
  maxBuckets?: number;
}

const DEFAULT_MAX_BUCKETS = 20;

/**
 * Builds the `$searchMeta` stage that computes facets.
 *
 * The `facet` collector groups by `category` and `tags` while applying the same
 * text query and filters as the main search, so facet counts reflect the
 * current result set rather than the whole collection.
 *
 * Important: a `facet` collector is a *top-level* operator, so the query must
 * be nested inside `facet.operator`. Placing `compound` at the same level as
 * `facet` is rejected with "Top-level operator is not allowed to be used with
 * collector".
 */
export function buildFacetMetaStage(
  params: AdvancedSearchParams,
  indexName: string,
  maxBuckets: number
): Record<string, unknown> {
  return {
    index: indexName,
    facet: {
      operator: {
        compound: {
          must:
            params.q === ""
              ? [{ match_all: {} }]
              : [
                  {
                    text: {
                      query: params.q,
                      path: ["title", "description", "content"],
                    },
                  },
                ],
          ...(params.category !== undefined || params.tags.length > 0
            ? {
                filter: [
                  ...(params.category !== undefined
                    ? [{ text: { query: params.category, path: "category" } }]
                    : []),
                  ...params.tags.map((tag) => ({
                    text: { query: tag, path: "tags" },
                  })),
                ],
              }
            : {}),
        },
      },
      facets: {
        categoryFacet: {
          type: "string",
          path: "category",
          numBuckets: maxBuckets,
        },
        tagsFacet: {
          type: "string",
          path: "tags",
          numBuckets: maxBuckets,
        },
      },
    },
  };
}

function toBuckets(raw: unknown): FacetBucket[] {
  const container = raw as { buckets?: unknown } | undefined;
  const list = container?.buckets;
  if (!Array.isArray(list)) {
    return [];
  }
  const buckets: FacetBucket[] = [];
  for (const entry of list) {
    const bucket = entry as { _id?: unknown; count?: unknown };
    if (typeof bucket._id === "string" && typeof bucket.count === "number") {
      buckets.push({ value: bucket._id, count: bucket.count });
    }
  }
  return buckets.sort((a, b) => b.count - a.count);
}

/**
 * Executes a facet aggregation against Atlas Search.
 */
export function createFacetRepository(
  db: Db,
  options: FacetRepositoryOptions = {}
): FacetRepository {
  const indexName = options.indexName ?? ATLAS_SEARCH_INDEX_NAME;
  const maxBuckets = options.maxBuckets ?? DEFAULT_MAX_BUCKETS;

  const facets = async (params: AdvancedSearchParams): Promise<FacetResult> => {
    const collection = db.collection("documents");
    const rows = await collection
      .aggregate([{ $searchMeta: buildFacetMetaStage(params, indexName, maxBuckets) }])
      .toArray();

    const facet = (rows[0] as { facet?: Record<string, unknown> } | undefined)?.facet ?? {};

    return {
      category: toBuckets(facet.categoryFacet),
      tags: toBuckets(facet.tagsFacet),
    };
  };

  return { facets };
}