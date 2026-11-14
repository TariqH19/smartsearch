import type { Db, Filter, FindOptions, Sort } from "mongodb";
import type { DocumentRecord } from "../models/document.js";
import type { SearchQuery } from "./query.js";

export interface SearchHit {
  document: DocumentRecord;
  score?: number;
}

export interface SearchPage {
  hits: SearchHit[];
  total: number;
}

export interface SearchRepository {
  search(query: SearchQuery): Promise<SearchPage>;
}

export interface SearchRepositoryOptions {
  /** Restricts which fields are returned (defaults to excluding content). */
  project?: Projection;
}

/**
 * A MongoDB projection value: include, exclude, or a computed metadata field
 * such as `{ $meta: "textScore" }`.
 */
export type Projection = Record<string, 0 | 1 | { $meta: "textScore" }>;

const DEFAULT_PROJECTION: Projection = {
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
 * Builds the MongoDB filter for a validated query.
 *
 * Exported for unit testing. Every value comes from the allow-listing
 * validation layer, so no untrusted input is ever interpreted as an operator.
 */
export function buildFilter(query: SearchQuery): Filter<DocumentRecord> {
  const filter: Filter<DocumentRecord> = {};

  if (query.q !== "") {
    filter.$text = { $search: query.q };
  }

  if (query.category !== undefined) {
    filter.category = query.category;
  }

  if (query.tags.length > 0) {
    filter.tags = { $all: query.tags };
  }

  return filter;
}

/**
 * Builds the sort specification.
 *
 * Each branch mirrors an index in `db/documents.ts` exactly, so MongoDB can
 * return results in index order instead of performing an in-memory sort.
 *
 * Relevance is only meaningful when a text query is present; callers guarantee
 * that via validation, and this guard keeps the repository safe on its own.
 */
export function buildSort(query: SearchQuery): Sort {
  switch (query.sort) {
    case "relevance":
      // The text index already yields score-descending order; createdAt and _id
      // are appended as deterministic tie-breakers for equal scores.
      return query.q === ""
        ? { createdAt: -1, _id: -1 }
        : { score: { $meta: "textScore" }, createdAt: -1, _id: -1 };
    case "updated":
      return { updatedAt: -1, _id: -1 };
    case "created":
    default:
      return { createdAt: -1, _id: -1 };
  }
}

/**
 * Builds the projection for a query.
 *
 * The text-score metadata field is merged into the caller's projection (or the
 * default) rather than replacing it. Overwriting the projection was the cause
 * of `score` never reaching API responses.
 */
export function buildProjection(
  query: SearchQuery,
  base: Projection = DEFAULT_PROJECTION
): Projection {
  if (query.sort === "relevance" && query.q !== "") {
    return { ...base, score: { $meta: "textScore" } };
  }
  return base;
}

export function buildFindOptions(query: SearchQuery): FindOptions {
  return {
    sort: buildSort(query),
    projection: buildProjection(query),
    skip: (query.page - 1) * query.pageSize,
    limit: query.pageSize,
  };
}

/**
 * Executes a search against the `documents` collection.
 *
 * Count and page fetch run concurrently. `$text` requires the `title_text`
 * index, which is declared in `db/documents.ts`.
 */
export function createSearchRepository(
  db: Db,
  options: SearchRepositoryOptions = {}
): SearchRepository {
  const collection = db.collection<DocumentRecord>("documents");

  const search = async (query: SearchQuery): Promise<SearchPage> => {
    const filter = buildFilter(query);
    const findOptions: FindOptions = buildFindOptions(query);
    // Merge any caller-supplied projection with the computed score projection
    // so a relevance search keeps its `score` field.
    if (options.project) {
      findOptions.projection = buildProjection(query, options.project);
    }

    const [documents, total] = await Promise.all([
      collection.find(filter, findOptions).toArray(),
      collection.countDocuments(filter),
    ]);

    const hits: SearchHit[] = documents.map((document) => {
      const record = document as DocumentRecord & { score?: number };
      const { score, ...rest } = record;
      return typeof score === "number" ? { document: rest, score } : { document: rest };
    });

    return { hits, total };
  };

  return { search };
}