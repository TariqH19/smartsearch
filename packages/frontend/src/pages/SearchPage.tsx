import { useRef, useState, type ReactNode } from "react";
import { apiClient } from "../api/client";
import type {
  AdvancedSearchMeta,
  FacetResult,
  SearchHit,
  SearchMeta,
} from "../api/types";
import { AppHeader } from "../components/layout/AppHeader";
import { AppShell } from "../components/layout/AppShell";
import { FilterSidebar, type FacetBucket } from "../components/search/FilterSidebar";
import { PaginationBar } from "../components/search/PaginationBar";
import { SearchBar } from "../components/search/SearchBar";
import { SearchEngineSelector } from "../components/search/SearchEngineSelector";
import type { SearchEngine } from "../components/search/SearchEngineSelector";
import { SearchResults } from "../components/search/SearchResults";
import { SortSelector } from "../components/search/SortSelector";
import {
  DEFAULT_PAGE_SIZE,
  buildPagination,
  isSortSupported,
  resetPage,
  type SearchSort,
} from "../components/search/searchHelpers";
import { type DocumentCategory, isDocumentCategory } from "../shared/categories";

const ENGINE_LABELS: Record<SearchEngine, string> = {
  baseline: "Baseline Search",
  atlas: "Atlas Search",
};

interface SearchCriteria {
  engine: SearchEngine;
  category: DocumentCategory | undefined;
  tags: string[];
  sort: SearchSort;
}

/**
 * Search page orchestrator with pagination, sorting and Atlas facets.
 *
 * Searches are submitted explicitly. A monotonic request sequence prevents
 * stale responses from replacing results for newer search criteria.
 */
export interface SearchPageProps {
  header?: ReactNode;
}

export function SearchPage({ header }: SearchPageProps = {}) {
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [engine, setEngine] = useState<SearchEngine>("baseline");
  const [category, setCategory] = useState<DocumentCategory | undefined>();
  const [tags, setTags] = useState<string[]>([]);
  const [sort, setSort] = useState<SearchSort>("relevance");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const seq = useRef(0);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);
  const [tookMs, setTookMs] = useState<number | undefined>();
  const [categoryFacets, setCategoryFacets] = useState<FacetBucket[]>([]);
  const [tagFacets, setTagFacets] = useState<FacetBucket[]>([]);

  const currentCriteria = (): SearchCriteria => ({
    engine,
    category,
    tags,
    sort,
  });

  const clearResults = () => {
    setHits([]);
    setTotal(0);
    setTotalPages(1);
    setHasNextPage(false);
    setHasPreviousPage(false);
    setTookMs(undefined);
    setError(null);
    setSearched(false);
    setSearchedQuery("");
    setCategoryFacets([]);
    setTagFacets([]);
    setPage(1);
    setPageSize(DEFAULT_PAGE_SIZE);
    setLoading(false);
  };

  const runSearch = async (
    value: string,
    requestedPage: number,
    criteria: SearchCriteria
  ) => {
    const trimmed = value.trim();
    const canSearchWithoutQuery =
      criteria.engine === "baseline" && criteria.sort !== "relevance";

    if (trimmed === "" && !canSearchWithoutQuery) {
      seq.current += 1;
      clearResults();
      return;
    }

    const requestId = ++seq.current;
    setPage(requestedPage);
    setSearchedQuery(trimmed);
    setSearched(true);
    setLoading(true);
    setError(null);

    if (criteria.engine === "atlas") {
      setCategoryFacets([]);
      setTagFacets([]);
    }

    try {
      let results: SearchHit[];
      let meta: SearchMeta | AdvancedSearchMeta;
      let facets: FacetResult | undefined;

      if (criteria.engine === "baseline") {
        const response = await apiClient.search({
          q: trimmed,
          category: criteria.category,
          tags: criteria.tags,
          page: requestedPage,
          pageSize,
          sort: criteria.sort,
        });
        results = response.results;
        meta = response.meta;
      } else {
        const response = await apiClient.advancedSearch({
          q: trimmed,
          category: criteria.category,
          tags: criteria.tags,
          page: requestedPage,
          pageSize,
          facets: true,
        });
        results = response.results;
        meta = response.meta;
        facets = response.facets;
      }

      if (requestId !== seq.current) {
        return;
      }

      const pagination = buildPagination(
        meta.page,
        meta.pageSize,
        meta.total,
        {
          totalPages: meta.totalPages,
          hasNextPage: meta.hasNextPage,
          hasPreviousPage: meta.hasPreviousPage,
        }
      );

      setHits(results);
      setPage(pagination.page);
      setPageSize(pagination.pageSize);
      setTotal(pagination.total);
      setTotalPages(pagination.totalPages);
      setHasNextPage(pagination.hasNextPage);
      setHasPreviousPage(pagination.hasPreviousPage);
      setTookMs(meta.tookMs);

      if (criteria.engine === "atlas") {
        setCategoryFacets(facets?.category ?? []);
        setTagFacets(facets?.tags ?? []);
      }
    } catch (requestError) {
      if (requestId !== seq.current) {
        return;
      }

      setHits([]);
      setTotal(0);
      setTotalPages(1);
      setHasNextPage(false);
      setHasPreviousPage(false);
      setTookMs(undefined);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Search failed. Please try again."
      );
    } finally {
      if (requestId === seq.current) {
        setLoading(false);
      }
    }
  };

  const handleSearchSubmit = (value: string) => {
    const trimmed = value.trim();
    setQuery(trimmed);
    void runSearch(trimmed, resetPage(), currentCriteria());
  };

  const handleEngineChange = (nextEngine: SearchEngine) => {
    const nextSort = isSortSupported(nextEngine, sort) ? sort : "relevance";
    const criteria = { ...currentCriteria(), engine: nextEngine, sort: nextSort };
    setEngine(nextEngine);
    setSort(nextSort);
    setPage(resetPage());

    if (searched) {
      void runSearch(searchedQuery, resetPage(), criteria);
    }
  };

  const handleCategoryChange = (value: string | undefined) => {
    const nextCategory =
      value !== undefined && isDocumentCategory(value) ? value : undefined;
    const criteria = { ...currentCriteria(), category: nextCategory };
    setCategory(nextCategory);
    setPage(resetPage());

    if (searched) {
      void runSearch(searchedQuery, resetPage(), criteria);
    }
  };

  const handleTagToggle = (tag: string) => {
    const nextTags = tags.includes(tag)
      ? tags.filter((currentTag) => currentTag !== tag)
      : [...tags, tag];
    const criteria = { ...currentCriteria(), tags: nextTags };
    setTags(nextTags);
    setPage(resetPage());

    if (searched) {
      void runSearch(searchedQuery, resetPage(), criteria);
    }
  };

  const handleClearAll = () => {
    const criteria = { ...currentCriteria(), category: undefined, tags: [] };
    setCategory(undefined);
    setTags([]);
    setPage(resetPage());

    if (searched) {
      void runSearch(searchedQuery, resetPage(), criteria);
    }
  };

  const handleSortChange = (nextSort: SearchSort) => {
    if (!isSortSupported(engine, nextSort)) {
      return;
    }

    const criteria = { ...currentCriteria(), sort: nextSort };
    setSort(nextSort);
    setPage(resetPage());

    if (searched) {
      void runSearch(searchedQuery, resetPage(), criteria);
    } else if (query.trim() === "" && engine === "baseline" && nextSort !== "relevance") {
      void runSearch("", resetPage(), criteria);
    }
  };

  const handleQueryChange = (value: string) => {
    if (value !== query) {
      seq.current += 1;
      setLoading(false);
    }
    setQuery(value);
    setPage(resetPage());
  };

  const pagination = buildPagination(page, pageSize, total, {
    totalPages,
    hasNextPage,
    hasPreviousPage,
  });
  const criteria = currentCriteria();
  const resultSummary =
    searched && !loading && !error
      ? (() => {
          const totalResults = total;
          const start =
            totalResults === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
          const end =
            totalResults === 0
              ? 0
              : Math.min(pagination.page * pagination.pageSize, totalResults);
          return `${totalResults} result${totalResults === 1 ? "" : "s"} · Showing ${start}-${end} · Page ${pagination.page} of ${Math.max(1, pagination.totalPages)}`;
        })()
      : null;

  return (
    <AppShell
      header={header ?? <AppHeader />}
      sidebar={
        <FilterSidebar
          categoryFacets={categoryFacets}
          tagFacets={tagFacets}
          selectedCategory={category}
          selectedTags={tags}
          onCategoryChange={handleCategoryChange}
          onTagToggle={handleTagToggle}
          onClearAll={handleClearAll}
        />
      }
      main={
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              SmartSearch
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Search documents with MongoDB text search or Atlas Search.
            </p>
          </div>

          <div className="space-y-3">
            <SearchBar
              value={query}
              onChange={handleQueryChange}
              onSubmit={handleSearchSubmit}
              loading={loading}
            />
            <div className="flex flex-wrap items-center justify-center gap-3">
              <SearchEngineSelector
                value={engine}
                onChange={handleEngineChange}
              />
              <SortSelector
                value={sort}
                onChange={handleSortChange}
                engine={engine}
                hasQuery={query.trim() !== ""}
              />
            </div>
          </div>

          {resultSummary && (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
              <span className="font-semibold text-slate-900">{resultSummary}</span>
            </div>
          )}

          <SearchResults
            hits={hits}
            loading={loading}
            error={error}
            onRetry={() => void runSearch(searchedQuery, page, criteria)}
            searched={searched}
            query={searchedQuery}
            engineLabel={ENGINE_LABELS[engine]}
            total={total}
            tookMs={tookMs}
          />

          {searched && !loading && !error && total > 0 && (
            <PaginationBar
              state={pagination}
              onPrevious={() => {
                if (pagination.hasPreviousPage) {
                  void runSearch(searchedQuery, pagination.page - 1, criteria);
                }
              }}
              onNext={() => {
                if (pagination.hasNextPage) {
                  void runSearch(searchedQuery, pagination.page + 1, criteria);
                }
              }}
              onGoToPage={(requestedPage) => {
                if (
                  requestedPage >= 1 &&
                  requestedPage <= pagination.totalPages &&
                  requestedPage !== pagination.page
                ) {
                  void runSearch(searchedQuery, requestedPage, criteria);
                }
              }}
            />
          )}
        </div>
      }
    />
  );
}
