import { LoadingSpinner } from "../ui/LoadingSpinner";
import { ErrorState } from "../ui/ErrorState";
import { EmptyState } from "./EmptyState";
import { NoResultsState } from "./NoResultsState";
import { ResultCard } from "./ResultCard";
import { cn } from "../../utils/cn";
import type { SearchHit } from "../../api/types";

export interface SearchResultsProps {
  hits: SearchHit[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onTitleClick?: (hit: SearchHit) => void;
  /**
   * Whether a search has actually been submitted. False renders the initial
   * empty state; true with zero hits renders the no-results state.
   */
  searched?: boolean;
  /** Shown in the no-results state and result header. */
  query?: string;
  /** Shown in the result header, e.g. "Baseline Search" or "Atlas Search". */
  engineLabel?: string;
  /** Total result count, used in the result header. */
  total?: number;
  /** Search duration in milliseconds, if available. */
  tookMs?: number;
  className?: string;
}

/**
 * Results list with loading, empty, no-results and error states.
 *
 * The component is presentation-only: it receives already-fetched data and
 * never calls the API itself. That keeps it unit-testable and lets the parent
 * (`SearchPage`) own all side effects.
 */
export function SearchResults({
  hits,
  loading,
  error,
  onRetry,
  onTitleClick,
  searched = false,
  query,
  engineLabel,
  total,
  tookMs,
  className,
}: SearchResultsProps) {
  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={onRetry}
        className={className}
      />
    );
  }

  if (loading) {
    return (
      <div className={cn("space-y-3", className)}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-3 w-full animate-pulse rounded bg-slate-200" />
            <div className="mt-3 flex gap-2">
              <div className="h-5 w-16 animate-pulse rounded-full bg-slate-200" />
              <div className="h-5 w-14 animate-pulse rounded-full bg-slate-200" />
            </div>
          </div>
        ))}
        <div className="flex justify-center py-4">
          <LoadingSpinner label="Searching documents…" />
        </div>
      </div>
    );
  }

  if (hits.length === 0) {
    return searched ? (
      <NoResultsState
        query={query}
        engine={engineLabel as "Baseline Search" | "Atlas Search" | undefined}
        onRetry={onRetry}
        onSwitchEngine={onRetry ? undefined : undefined}
        className={className}
      />
    ) : (
      <EmptyState className={className} />
    );
  }

  const visibleTotal = typeof total === "number" ? total : hits.length;

  return (
    <div className={cn("space-y-4", className)} aria-label={`${visibleTotal} search results`}>
      <div className="flex justify-end text-xs text-slate-400">
        {typeof tookMs === "number" && `${tookMs} ms`}
      </div>
      <ul className="space-y-3">
        {hits.map((hit) => (
          <li key={hit.document._id}>
            <ResultCard hit={hit} onTitleClick={onTitleClick} />
          </li>
        ))}
      </ul>
    </div>
  );
}