import { cn } from "../../utils/cn";
import { ChevronLeftIcon, ChevronRightIcon } from "../ui/Icons";
import type { PaginationState } from "./searchHelpers";
import { resultRange } from "./searchHelpers";

export interface PaginationBarProps {
  state: PaginationState;
  onPrevious: () => void;
  onNext: () => void;
  onGoToPage: (page: number) => void;
  className?: string;
}

/**
 * Pagination control: Previous / Next plus a range label.
 *
 * Previous is disabled on the first page and Next on the last page, using the
 * backend's own flags so a backend quirk cannot silently hide the last page.
 */
export function PaginationBar({
  state,
  onPrevious,
  onNext,
  onGoToPage,
  className,
}: PaginationBarProps) {
  const range = resultRange(state);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3",
        className
      )}
    >
      <div className="text-sm text-slate-500">
        <span className="font-medium text-slate-700">{range.label}</span>
        <span className="mx-1.5 text-slate-300">|</span>
        <span>
          Page <span className="font-medium text-slate-700">{state.page}</span>{" "}
          of{" "}
          <span className="font-medium text-slate-700">{state.totalPages}</span>
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onGoToPage(1)}
          disabled={!state.hasPreviousPage}
          aria-label="First page"
          className={cn(
            "flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
            state.hasPreviousPage
              ? "text-slate-700 hover:bg-slate-100"
              : "cursor-not-allowed text-slate-400"
          )}
        >
          <ChevronLeftIcon size={16} />
          <span className="sr-only">First</span>
        </button>
        <button
          type="button"
          onClick={onPrevious}
          disabled={!state.hasPreviousPage}
          aria-label="Previous page"
          className={cn(
            "flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            state.hasPreviousPage
              ? "text-slate-700 hover:bg-slate-100"
              : "cursor-not-allowed text-slate-400"
          )}
        >
          <ChevronLeftIcon size={16} />
          Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!state.hasNextPage}
          aria-label="Next page"
          className={cn(
            "flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            state.hasNextPage
              ? "text-slate-700 hover:bg-slate-100"
              : "cursor-not-allowed text-slate-400"
          )}
        >
          Next
          <ChevronRightIcon size={16} />
        </button>
        <button
          type="button"
          onClick={() => onGoToPage(state.totalPages)}
          disabled={!state.hasNextPage}
          aria-label="Last page"
          className={cn(
            "flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
            state.hasNextPage
              ? "text-slate-700 hover:bg-slate-100"
              : "cursor-not-allowed text-slate-400"
          )}
        >
          <ChevronRightIcon size={16} />
          <span className="sr-only">Last</span>
        </button>
      </div>
    </div>
  );
}