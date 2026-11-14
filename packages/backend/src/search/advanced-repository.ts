import type { Db } from "mongodb";
import type { DocumentRecord } from "../models/document.js";
import type { AdvancedSearchParams } from "./advanced-query.js";
import { ATLAS_SEARCH_INDEX_NAME } from "./atlas-index.js";

export interface AdvancedSearchHit {
  document: Record<string, unknown>;
  score: number;
}

export interface AdvancedSearchPage {
  hits: AdvancedSearchHit[];
  total: number;
}

export interface AdvancedSearchRepository {
  search(params: AdvancedSearchParams): Promise<AdvancedSearchPage>;
}

export interface AdvancedSearchRepositoryOptions {
  indexName?: string;
  /** Projection applied to each returned document. */
  project?: Record<string, 0 | 1>;
}

const DEFAULT_PROJECTION: Record<string, 0 | 1> = {
  _id: 1,
  title: 1,
  description: 1,
  category: 1,
  tags: 1,
  author: 1,
  createdAt: 1,
  updatedAt: 1,
};

/**
 * Builds the `$search` stage for an advanced query.
 *
 * Exported for unit testing. Structure:
 * - `compound.must`: a `text` operator across the free-text fields, with
 *   optional `fuzzy` matching.
 * - `compound.filter`: exact-match filters for `category` and `tags` that do
 *   not contribute to the score.
 */
export function buildSearchStage(
  params: AdvancedSearchParams,
  indexName: string = ATLAS_SEARCH_INDEX_NAME
): Record<string, unknown> {
  const textClause: Record<string, unknown> = {
    query: params.q,
    path: ["title", "description", "content"],
  };

  if (params.fuzzy) {
    textClause.fuzzy = {
      maxEdits: params.fuzzyMaxEdits,
      prefixLength: params.fuzzyPrefixLength,
    };
  }

  const must: Array<Record<string, unknown>> = [];
  if (params.q !== "") {
    must.push({ text: textClause });
  } else {
    // An empty query must still match documents for browsing; match_all keeps
    // the compound stage valid and returns everything, subject to filters.
    must.push({ match_all: {} });
  }

  const filter: Array<Record<string, unknown>> = [];
  if (params.category !== undefined) {
    filter.push({ text: { query: params.category, path: "category" } });
  }
  if (params.tags.length > 0) {
    // One clause per tag: filter clauses are ANDed, so every requested tag
    // must be present.
    for (const tag of params.tags) {
      filter.push({ text: { query: tag, path: "tags" } });
    }
  }

  const compound: Record<string, unknown> = { must };
  if (filter.length > 0) {
    compound.filter = filter;
  }

  return { index: indexName, compound };
}

/**
 * Builds the `$searchMeta` stage used to obtain an exact match count.
 *
 * `$searchMeta` returns metadata (here, the total count) without fetching
 * documents, so it is much cheaper than counting a full `$search` result set.
 */
export function buildSearchMetaStage(
  params: AdvancedSearchParams,
  indexName: string = ATLAS_SEARCH_INDEX_NAME
): Record<string, unknown> {
  return {
    index: indexName,
    ...buildSearchStage(params, indexName),
    count: { type: "total" },
  };
}

/**
 * Builds the full aggregation pipeline for an advanced search.
 *
 * Exported for unit testing. The pipeline is:
 *   $search -> $addFields (score) -> $skip -> $limit -> $project
 */
export function buildSearchPipeline(
  params: AdvancedSearchParams,
  indexName: string,
  projection: Record<string, 0 | 1>
): Record<string, unknown>[] {
  const skip = (params.page - 1) * params.pageSize;

  return [
    { $search: buildSearchStage(params, indexName) },
    {
      $addFields: {
        _score: { $meta: "searchScore" },
      },
    },
    { $skip: skip },
    { $limit: params.pageSize },
    {
      $project: {
        ...projection,
        _score: 1,
      },
    },
  ];
}

/**
 * Executes an advanced search against Atlas Search.
 *
 * The page of results and the exact total are fetched in parallel: the page via
 * `$search`, the total via `$searchMeta` (which does not return documents).
 */
export function createAdvancedSearchRepository(
  db: Db,
  options: AdvancedSearchRepositoryOptions = {}
): AdvancedSearchRepository {
  const indexName = options.indexName ?? ATLAS_SEARCH_INDEX_NAME;
  const projection = options.project ?? DEFAULT_PROJECTION;

  const search = async (
    params: AdvancedSearchParams
  ): Promise<AdvancedSearchPage> => {
    const collection = db.collection<DocumentRecord>("documents");

    const searchStage = { $search: buildSearchStage(params, indexName) };
    const metaStage = { $searchMeta: buildSearchMetaStage(params, indexName) };

    const [documents, metaRows] = await Promise.all([
      collection
        .aggregate([
          searchStage,
          { $addFields: { _score: { $meta: "searchScore" } } },
          { $skip: (params.page - 1) * params.pageSize },
          { $limit: params.pageSize },
          { $project: { ...projection, _score: 1 } },
        ])
        .toArray(),
      collection.aggregate([metaStage]).toArray(),
    ]);

    const meta = metaRows[0] as { count?: { total?: number } } | undefined;
    const total = meta?.count?.total ?? documents.length;

    const hits: AdvancedSearchHit[] = documents.map((raw) => {
      const row = raw as Record<string, unknown>;
      const score = typeof row._score === "number" ? row._score : 0;
      const { _score: _ignored, ...document } = row;
      return { document, score };
    });

    return { hits, total };
  };

  return { search };
}