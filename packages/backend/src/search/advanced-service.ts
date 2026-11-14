import { ApiError } from "../middleware/error.js";
import type { AdvancedSearchParams } from "./advanced-query.js";
import type { AdvancedSearchPage, AdvancedSearchRepository } from "./advanced-repository.js";
import type { FacetRepository, FacetResult } from "./facet-repository.js";
import type { SuggestParams, SuggestRepository } from "./suggest-repository.js";
import { MIN_SUGGEST_LENGTH } from "./suggest-query.js";
import { ATLAS_SEARCH_INDEX_NAME, DOCUMENTS_AUTOCOMPLETE_INDEX } from "./atlas-index.js";
import type { IndexStatusProbe } from "./atlas-status.js";

export interface AdvancedSearchMeta {
  query: string;
  category?: string;
  tags: string[];
  fuzzy: boolean;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  tookMs: number;
  engine: "atlas-search";
}

export interface AdvancedSearchResponse {
  results: Array<{ document: Record<string, unknown>; score: number }>;
  facets?: FacetResult;
  meta: AdvancedSearchMeta;
}

export interface SuggestResponse {
  query: string;
  suggestions: string[];
  tookMs: number;
}

export interface AdvancedSearchServiceOptions {
  now?: () => number;
  logger?: { error(message: string): void };
  /**
   * Optional readiness probe. When supplied, searches and suggestions return
   * 503 unless the relevant Atlas Search index is queryable, so a missing or
   * still-building index is never reported as "no results".
   */
  indexStatus?: IndexStatusProbe;
  searchIndexName?: string;
  suggestIndexName?: string;
}

/**
 * Maps a driver/aggregation failure to a safe 503.
 *
 * Atlas Search reports several distinct failure modes (missing index, index
 * still building, search not enabled on the cluster). None of them should be
 * surfaced verbatim to a client, so every failure collapses to one message.
 */
export function toSearchUnavailable(_error: unknown): ApiError {
  return new ApiError(503, "Atlas Search is unavailable");
}

export function createAdvancedSearchService(
  searchRepository: AdvancedSearchRepository,
  facetRepository?: FacetRepository,
  suggestRepository?: SuggestRepository,
  options: AdvancedSearchServiceOptions = {}
) {
  const now = options.now ?? (() => Date.now());
  const logger = options.logger ?? console;
  const searchIndexName = options.searchIndexName ?? ATLAS_SEARCH_INDEX_NAME;
  const suggestIndexName = options.suggestIndexName ?? DOCUMENTS_AUTOCOMPLETE_INDEX.name;

  const assertQueryable = async (indexName: string): Promise<void> => {
    if (!options.indexStatus) {
      return;
    }
    const status = await options.indexStatus.status(indexName);
    if (!status.queryable) {
      throw new ApiError(503, "Atlas Search is unavailable");
    }
  };

  const search = async (
    params: AdvancedSearchParams,
    includeFacets = false
  ): Promise<AdvancedSearchResponse> => {
    const startedAt = now();

    let page: AdvancedSearchPage;
    let facets: FacetResult | undefined;

    try {
      await assertQueryable(searchIndexName);
      page = await searchRepository.search(params);
      if (includeFacets && facetRepository) {
        facets = await facetRepository.facets(params);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      logger.error(
        "[smartsearch] atlas search failed: " + (error instanceof Error ? error.name : typeof error)
      );
      throw toSearchUnavailable(error);
    }

    const totalPages =
      params.pageSize > 0 ? Math.ceil(page.total / params.pageSize) : 0;

    const meta: AdvancedSearchMeta = {
      query: params.q,
      ...(params.category !== undefined ? { category: params.category } : {}),
      tags: params.tags,
      fuzzy: params.fuzzy,
      page: params.page,
      pageSize: params.pageSize,
      total: page.total,
      totalPages,
      hasNextPage: params.page < totalPages,
      hasPreviousPage: params.page > 1 && page.total > 0,
      tookMs: now() - startedAt,
      engine: "atlas-search",
    };

    const results = page.hits.map((hit) => {
      const { content: _content, ...document } = hit.document as Record<string, unknown>;
      return { document, score: hit.score };
    });

    return { results, ...(facets ? { facets } : {}), meta };
  };

  const suggest = async (params: SuggestParams): Promise<SuggestResponse> => {
    const startedAt = now();

    if (!suggestRepository) {
      throw new ApiError(503, "Autocomplete is not configured");
    }

    // Short or empty input is not an error and must not hit Atlas Search.
    if (params.q.length < MIN_SUGGEST_LENGTH) {
      return { query: params.q, suggestions: [], tookMs: now() - startedAt };
    }

    let suggestions: string[];
    try {
      await assertQueryable(suggestIndexName);
      suggestions = await suggestRepository.suggest(params);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      logger.error(
        "[smartsearch] atlas autocomplete failed: " +
          (error instanceof Error ? error.name : typeof error)
      );
      throw toSearchUnavailable(error);
    }

    return {
      query: params.q,
      suggestions,
      tookMs: now() - startedAt,
    };
  };

  return { search, suggest };
}

export type AdvancedSearchService = ReturnType<typeof createAdvancedSearchService>;