/**
 * Pure pagination and sorting helpers for the search experience.
 *
 * Extracted from the React layer so boundary behaviour, range formatting and
 * sort-option negotiation can be unit-tested without a DOM or API client.
 */

/** Sort options supported by the baseline `$text` endpoint. */
export const BASELINE_SORTS = ["relevance", "created", "updated"] as const;
export type BaselineSort = (typeof BASELINE_SORTS)[number];

/** Sort options supported by the Atlas Search endpoint. */
export const ATLAS_SORTS = ["relevance"] as const;
export type AtlasSort = (typeof ATLAS_SORTS)[number];

export type SearchSort = BaselineSort;

/** Default page size used when the backend does not return one. */
export const DEFAULT_PAGE_SIZE = 20;

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface RangeLabel {
  start: number;
  end: number;
  total: number;
  label: string;
}

/**
 * Builds a pagination state object from backend metadata.
 *
 * `totalPages` is taken from the backend when present; otherwise it is
 * derived from `total` and `pageSize`. The backend's own flags are trusted
 * for `hasNextPage`/`hasPreviousPage` rather than re-derived, so a backend
 * quirk cannot silently hide the last page.
 */
export function buildPagination(
  page: number,
  pageSize: number,
  total: number,
  meta?: { totalPages?: number; hasNextPage?: boolean; hasPreviousPage?: boolean }
): PaginationState {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const safeSize = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE;
  const safeTotal = Number.isInteger(total) && total >= 0 ? total : 0;

  let totalPages: number;
  if (meta?.totalPages !== undefined && Number.isInteger(meta.totalPages)) {
    totalPages = meta.totalPages;
  } else {
    totalPages = Math.max(1, Math.ceil(safeTotal / safeSize));
  }

  return {
    page: safePage,
    pageSize: safeSize,
    total: safeTotal,
    totalPages,
    hasNextPage: meta?.hasNextPage ?? safePage < totalPages,
    hasPreviousPage: meta?.hasPreviousPage ?? safePage > 1,
  };
}

/**
 * Returns the 1-based start and end of the visible result range.
 *
 * The range is derived from the page and page size, never from the length of
 * the visible array, so it stays correct even when the backend returns fewer
 * items than the page size on the last page.
 */
export function resultRange(state: PaginationState): RangeLabel {
  const start = (state.page - 1) * state.pageSize + 1;
  const end = Math.min(state.page * state.pageSize, state.total);
  const clampedEnd = end < start ? start - 1 : end;
  return {
    start: state.total === 0 ? 0 : start,
    end: clampedEnd,
    total: state.total,
    label: state.total === 0
      ? "No results"
      : `Showing ${start}-${clampedEnd} of ${state.total}`,
  };
}

/** Returns the page that should be requested after a filter or sort change. */
export function resetPage(): number {
  return 1;
}

/** Returns true when the requested page is at a boundary. */
export function isBoundary(state: PaginationState): boolean {
  return !state.hasPreviousPage && !state.hasNextPage;
}

/**
 * Negotiates the sort options available for a given engine.
 *
 * Atlas Search currently supports relevance ordering only.
 */
export function sortOptionsForEngine(
  engine: "baseline" | "atlas"
): readonly SearchSort[] {
  return engine === "atlas" ? ATLAS_SORTS : BASELINE_SORTS;
}

/** Returns true when the requested sort is supported by the engine. */
export function isSortSupported(
  engine: "baseline" | "atlas",
  sort: string
): boolean {
  return sortOptionsForEngine(engine).some((option) => option === sort);
}

/** Human-friendly labels for each sort option. */
export const SORT_LABELS: Record<SearchSort, string> = {
  relevance: "Relevance",
  created: "Newest first",
  updated: "Recently updated",
};

/** Sort options exposed to the UI, in display order. */
export const SORT_OPTIONS: { value: SearchSort; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "created", label: "Newest first" },
  { value: "updated", label: "Recently updated" },
];

/** A short note explaining that relevance requires a query. */
export const RELEVANCE_NOTE =
  "Relevance requires a non-empty query; created/updated work without one.";