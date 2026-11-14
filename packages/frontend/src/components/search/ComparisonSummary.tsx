import { cn } from "../../utils/cn";
import type { ComparisonOutcome } from "./comparisonService";
import { formatDuration, fasterEngineLabel } from "./comparisonService";

export interface ComparisonSummaryProps {
  outcome: ComparisonOutcome;
  className?: string;
}

/**
 * Compact summary shown after both searches finish.
 *
 * Wording is deliberately careful: it reports what this single request
 * measured, not a general statement about which engine is faster. Durations
 * are individual request measurements and may be affected by caching, network
 * conditions and concurrent database activity.
 */
export function ComparisonSummary({ outcome, className }: ComparisonSummaryProps) {
  const { baseline, atlas, bothSucceeded, countDelta, fasterEngine } = outcome;

  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-4",
        className
      )}
    >
      <h3 className="text-sm font-semibold text-slate-900">Comparison summary</h3>

      {bothSucceeded ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-xs text-slate-500">Baseline results</p>
            <p className="text-lg font-semibold text-slate-900">
              {baseline.total}
            </p>
            <p className="text-xs text-slate-400">{formatDuration(baseline.tookMs)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Atlas results</p>
            <p className="text-lg font-semibold text-slate-900">
              {atlas.total}
            </p>
            <p className="text-xs text-slate-400">{formatDuration(atlas.tookMs)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Count difference</p>
            <p
              className={cn(
                "text-lg font-semibold",
                countDelta > 0
                  ? "text-brand-700"
                  : countDelta < 0
                    ? "text-slate-700"
                    : "text-slate-500"
              )}
            >
              {countDelta > 0 ? "+" : ""}{countDelta}
            </p>
            <p className="text-xs text-slate-400">Atlas minus Baseline</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Lower duration</p>
            <p className="text-sm font-medium text-slate-900">
              {fasterEngineLabel(fasterEngine) ?? "—"}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">
          One or both engines did not complete, so a full comparison is not
          available for this run.
        </p>
      )}

      <p className="mt-3 text-xs leading-relaxed text-slate-400">
        Durations are individual request measurements for this query and may
        be affected by caching, network conditions and concurrent database
        activity. This is not a statistically valid benchmark.
      </p>
    </div>
  );
}