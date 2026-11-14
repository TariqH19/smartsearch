import type { Db } from "mongodb";
import { DOCUMENTS_AUTOCOMPLETE_INDEX } from "./atlas-index.js";
import type { SuggestParams } from "./suggest-query.js";

export type { SuggestParams };

/** Bounds on the number of suggestions returned. */
export const DEFAULT_SUGGEST_LIMIT = 5;
export const MAX_SUGGEST_LIMIT = 10;
/** Minimum input length before autocomplete is attempted. */
export const MIN_SUGGEST_LENGTH = 2;
export const MAX_SUGGEST_LENGTH = 100;

export interface SuggestRepository {
  suggest(params: SuggestParams): Promise<string[]>;
}

export interface SuggestRepositoryOptions {
  indexName?: string;
}

/**
 * Builds the `$search` stage for autocomplete.
 *
 * Uses the `autocomplete` operator against the title field, with `tokenization:
 * "edgeGram"` handled by the index itself (see `atlas-index.ts`).
 */
export function buildSuggestStage(
  params: SuggestParams,
  indexName: string
): Record<string, unknown> {
  return {
    index: indexName,
    autocomplete: {
      query: params.q,
      path: "title",
      tokenOrder: "any",
      fuzzy: { maxEdits: 1, prefixLength: 1 },
    },
  };
}

/**
 * Builds the aggregation pipeline for autocomplete.
 *
 * `$search` -> score -> sort -> group by title -> sort -> limit -> project
 *
 * The `$group` stage is what makes suggestions unique: several documents can
 * share a title (the seed data does), and without grouping the API returns the
 * same string twice. Grouping after the score sort, then re-sorting, keeps the
 * strongest match for each title and preserves relevance order. `$limit` runs
 * last so it still returns exactly `limit` distinct suggestions.
 */
export function buildSuggestPipeline(
  params: SuggestParams,
  indexName: string
): Record<string, unknown>[] {
  return [
    { $search: buildSuggestStage(params, indexName) },
    { $addFields: { _suggestScore: { $meta: "searchScore" } } },
    { $sort: { _suggestScore: -1 } },
    {
      $group: {
        _id: "$title",
        title: { $first: "$title" },
        _suggestScore: { $first: "$_suggestScore" },
      },
    },
    { $sort: { _suggestScore: -1 } },
    { $limit: params.limit },
    { $project: { _id: 0, title: 1 } },
  ];
}

/**
 * Converts aggregation rows into unique, ordered suggestion strings.
 *
 * The pipeline already groups by title, so this is a safety net that also drops
 * malformed rows. Order is preserved exactly as received.
 */
export function toUniqueTitles(rows: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const titles: string[] = [];

  for (const row of rows) {
    if (row === null || typeof row !== "object") {
      continue;
    }
    const title = (row as { title?: unknown }).title;
    if (typeof title !== "string" || title === "") {
      continue;
    }
    if (seen.has(title)) {
      continue;
    }
    seen.add(title);
    titles.push(title);
  }

  return titles;
}

/**
 * Executes autocomplete suggestions against Atlas Search.
 *
 * The autocomplete index is a separate index (`documents_autocomplete`) from
 * the main search index, because autocomplete requires its own tokenization.
 */
export function createSuggestRepository(
  db: Db,
  options: SuggestRepositoryOptions = {}
): SuggestRepository {
  const indexName = options.indexName ?? DOCUMENTS_AUTOCOMPLETE_INDEX.name;

  const suggest = async (params: SuggestParams): Promise<string[]> => {
    const collection = db.collection("documents");
    const rows = await collection
      .aggregate(buildSuggestPipeline(params, indexName))
      .toArray();

    return toUniqueTitles(rows);
  };

  return { suggest };
}