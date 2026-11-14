import { ApiError } from "../middleware/error.js";
import type { DocumentRecord } from "../models/document.js";
import type { SearchHit, SearchPage, SearchRepository } from "./repository.js";
import type { SearchQuery } from "./query.js";

export interface SearchMeta {
  query: string;
  category?: string;
  tags: string[];
  sort: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  tookMs: number;
}

export interface SearchResponse {
  results: PublicSearchHit[];
  meta: SearchMeta;
}

export interface SearchService {
  search(query: SearchQuery): Promise<SearchResponse>;
}

export interface SearchServiceOptions {
  /** Injected clock, so timing is deterministic in tests. */
  now?: () => number;
}

/**
 * Public projection for search results.
 *
 * `content` is deliberately excluded: documents can be large and search
 * results only need summary fields. Applied here as well as in the database
 * projection so a result can never leak full body text.
 */
export type SearchResultDocument = Omit<DocumentRecord, "content">;

export interface PublicSearchHit {
  document: SearchResultDocument;
  score?: number;
}

function toPublicHit(hit: SearchHit): PublicSearchHit {
  const { content: _content, ...document } = hit.document;
  return typeof hit.score === "number"
    ? { document, score: hit.score }
    : { document };
}

/**
 * Orchestrates a search: executes the repository query and shapes the response.
 *
 * MongoDB failures are translated into a 503 without leaking driver details.
 */
export function createSearchService(
  repository: SearchRepository,
  options: SearchServiceOptions = {}
): SearchService {
  const now = options.now ?? (() => Date.now());

  const search = async (query: SearchQuery): Promise<SearchResponse> => {
    const startedAt = now();

    let page: SearchPage;
    try {
      page = await repository.search(query);
    } catch (error) {
      // Never surface driver internals (host names, credentials, stack traces).
      console.error(
        "[smartsearch] search failed:",
        error instanceof Error ? error.name : typeof error
      );
      throw new ApiError(503, "Search is temporarily unavailable");
    }

    const totalPages = query.pageSize > 0 ? Math.ceil(page.total / query.pageSize) : 0;

    const meta: SearchMeta = {
      query: query.q,
      ...(query.category !== undefined ? { category: query.category } : {}),
      tags: query.tags,
      sort: query.sort,
      page: query.page,
      pageSize: query.pageSize,
      total: page.total,
      totalPages,
      hasNextPage: query.page < totalPages,
      hasPreviousPage: query.page > 1 && page.total > 0,
      tookMs: now() - startedAt,
    };

    return { results: page.hits.map(toPublicHit), meta };
  };

  return { search };
}