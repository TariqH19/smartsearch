import { useState } from "react";
import { ChevronDownIcon } from "../ui/Icons";
import { cn } from "../../utils/cn";
import {
  SORT_LABELS,
  type SearchSort,
  sortOptionsForEngine,
} from "./searchHelpers";

export interface SortSelectorProps {
  value: SearchSort;
  onChange: (sort: SearchSort) => void;
  engine: "baseline" | "atlas";
  hasQuery: boolean;
  className?: string;
}

/**
 * Sort dropdown.
 *
 * Only options supported by the selected engine are exposed. Relevance is
 * kept available but the parent can grey it out when there is no query, since
 * the backend rejects `sort=relevance` without a non-empty `q`.
 */
export function SortSelector({
  value,
  onChange,
  engine,
  hasQuery,
  className,
}: SortSelectorProps) {
  const [open, setOpen] = useState(false);
  const options = sortOptionsForEngine(engine);

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        aria-label="Sort results"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        )}
      >
        {SORT_LABELS[value]}
        <ChevronDownIcon size={14} className="text-slate-400" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <ul
            role="listbox"
            aria-label="Sort results"
            className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
          >
            {options.map((option) => {
              const isRelevance = option === "relevance";
              const disabled = isRelevance && !hasQuery;
              const selected = option === value;
              return (
                <li key={option}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={disabled}
                    onClick={() => {
                      if (disabled) {
                        return;
                      }
                      onChange(option);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-2 text-sm",
                      selected
                        ? "bg-brand-50 text-brand-700"
                        : "text-slate-700 hover:bg-slate-50",
                      disabled && "cursor-not-allowed text-slate-300"
                    )}
                  >
                    <span>{SORT_LABELS[option]}</span>
                    {isRelevance && !hasQuery && (
                      <span className="text-xs text-slate-400">needs query</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}