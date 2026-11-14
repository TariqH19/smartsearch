import { SearchIcon, FileTextIcon } from "../ui/Icons";
import { cn } from "../../utils/cn";

export interface EmptyStateProps {
  title?: string;
  description?: string;
  className?: string;
}

/**
 * Initial empty state shown before any search has run.
 *
 * Invites the user to search and gives a hint about what the platform can do.
 */
export function EmptyState({
  title = "Start searching your documents",
  description = "Type a query above to discover relevant documents across engineering, data, devops, security, design, and product.",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white py-12 text-center",
        className
      )}
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <SearchIcon size={28} />
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
          <FileTextIcon size={12} />
          200 documents indexed
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
          Baseline + Atlas Search
        </span>
      </div>
    </div>
  );
}