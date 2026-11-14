import { LoadingSpinner } from "../ui/LoadingSpinner";
import { ErrorState } from "../ui/ErrorState";
import { EmptyState } from "./EmptyState";
import { ResultCard } from "./ResultCard";
import { cn } from "../../utils/cn";
import type { SearchHit } from "../../api/types";

export interface EnginePanelProps {
  engine: "baseline" | "atlas";
  label: string;
  description: string;
  accent: "slate" | "brand";
  hits: SearchHit[];
  loading: boolean;
  error: string | null;
  total: number;
  tookMs?: number;
  onRetry?: () => void;
  className?: string;
}

const accentStyles: Record<EnginePanelProps["accent"], { ring: string; badge: string }> = {
  slate: {
    ring: "border-slate-200",
    badge: "bg-slate-100 text-slate-600",
  },
  brand: {
    ring: "border-brand-200",
    badge: "bg-brand-50 text-brand-700 ring-1 ring-brand-200",
  },
};

/**
 * One engine's result panel, used inside the comparison view.
 *
 * Each panel owns its own loading, error and empty state, so a failure in one
 * engine never hides the other's results.
 */
export function EnginePanel({
  engine,
  label,
  description,
  accent,
  hits,
  loading,
  error,
  total,
  tookMs,
  onRetry,
  className,
}: EnginePanelProps) {
  const styles = accentStyles[accent];

  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-white",
        styles.ring,
        className
      )}
      aria-label={`${label} results`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-slate-900">
              {label}
            </h3>
            <span
              className={cn(
                "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
                styles.badge
              )}
            >
              {engine === "atlas" ? "Atlas" : "MongoDB"}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">{description}</p>
        </div>
        {typeof tookMs === "number" && !loading && (
          <span className="shrink-0 text-xs text-slate-400">
            {tookMs < 1000 ? `${Math.round(tookMs)} ms` : `${(tookMs / 1000).toFixed(2)} s`}
          </span>
        )}
      </div>

      <div className="flex-1 p-4">
        {error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : loading ? (
          <div className="space-y-3">
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
            <div className="flex justify-center py-2">
              <LoadingSpinner label="Running…" />
            </div>
          </div>
        ) : hits.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-3">
            {hits.map((hit) => (
              <li key={hit.document._id}>
                <ResultCard hit={hit} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
        <span>
          <span className="font-medium text-slate-700">{total}</span>{" "}
          {total === 1 ? "result" : "results"}
        </span>
        {loading && <span className="text-brand-600">Running…</span>}
      </div>
    </section>
  );
}