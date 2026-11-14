import { SearchIcon } from "../ui/Icons";
import { cn } from "../../utils/cn";

export interface NoResultsStateProps {
  query?: string;
  engine?: "Baseline Search" | "Atlas Search";
  onRetry?: () => void;
  onSwitchEngine?: () => void;
  className?: string;
}

/**
 * Distinct no-results state, shown only after a real search returns zero
 * matches. It is deliberately separate from `EmptyState` so the UI can tell
 * "you haven't searched yet" apart from "you searched and found nothing".
 */
export function NoResultsState({
  query,
  engine,
  onRetry,
  onSwitchEngine,
  className,
}: NoResultsStateProps) {
  const queryPart = query && query.trim() !== "" ? ` for "${query}"` : "";
  const enginePart = engine ? ` using ${engine}` : "";

  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white py-12 text-center",
        className
      )}
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <SearchIcon size={28} />
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-900">
        No documents found{queryPart}
      </h3>
      <p className="mt-1 max-w-md text-sm text-slate-500">
        Your search{enginePart} did not match any documents. Try a different
        query, adjust your filters, or switch search engines.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            Search again
          </button>
        )}
        {onSwitchEngine && (
          <button
            type="button"
            onClick={onSwitchEngine}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
          >
            Switch search engine
          </button>
        )}
      </div>
    </div>
  );
}