import { useState } from "react";
import { Badge } from "../ui/Badge";
import { FilterIcon, ChevronDownIcon, ChevronUpIcon } from "../ui/Icons";
import { CATEGORY_LABELS } from "../../shared/categories";
import { cn } from "../../utils/cn";

export interface FacetBucket {
  value: string;
  count: number;
}

export interface FilterSidebarProps {
  categoryFacets?: FacetBucket[];
  tagFacets?: FacetBucket[];
  selectedCategory?: string;
  selectedTags?: string[];
  onCategoryChange: (category: string | undefined) => void;
  onTagToggle: (tag: string) => void;
  onClearAll: () => void;
  className?: string;
}

/**
 * Placeholder filter sidebar.
 *
 * Phase 3A renders static presentation. Props are typed against the real
 * facet contract so the component can be wired to live data in Phase 3B.
 */
export function FilterSidebar({
  categoryFacets = [],
  tagFacets = [],
  selectedCategory,
  selectedTags = [],
  onCategoryChange,
  onTagToggle,
  onClearAll,
  className,
}: FilterSidebarProps) {
  const [categoriesOpen, setCategoriesOpen] = useState(true);
  const [tagsOpen, setTagsOpen] = useState(true);

  const hasFilters =
    selectedCategory !== undefined || selectedTags.length > 0;

  return (
    <aside
      className={cn(
        "w-full shrink-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4 lg:w-64",
        className
      )}
      aria-label="Filters"
    >
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <FilterIcon size={16} />
          Filters
        </h2>
        {hasFilters && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs font-medium text-brand-600 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 rounded"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Categories */}
      <section>
        <button
          type="button"
          onClick={() => setCategoriesOpen((v) => !v)}
          aria-expanded={categoriesOpen}
          className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <span>Category</span>
          {categoriesOpen ? (
            <ChevronUpIcon size={14} />
          ) : (
            <ChevronDownIcon size={14} />
          )}
        </button>
        {categoriesOpen && (
          <div className="mt-1 space-y-0.5">
            <button
              type="button"
              onClick={() => onCategoryChange(undefined)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm",
                selectedCategory === undefined
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-50"
              )}
            >
              <span>All categories</span>
              <span className="text-xs text-slate-400">
                {categoryFacets.reduce((sum, f) => sum + f.count, 0)}
              </span>
            </button>
            {categoryFacets.map((facet) => {
              const label =
                (CATEGORY_LABELS as Record<string, string>)[facet.value] ??
                facet.value;
              const selected = selectedCategory === facet.value;
              return (
                <button
                  key={facet.value}
                  type="button"
                  onClick={() => onCategoryChange(facet.value)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm",
                    selected
                      ? "bg-brand-50 text-brand-700"
                      : "text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <span className="flex items-center gap-2">
                    {label}
                    {selected && <Badge tone="brand">Selected</Badge>}
                  </span>
                  <span className="text-xs text-slate-400">{facet.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Tags */}
      <section className="border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={() => setTagsOpen((v) => !v)}
          aria-expanded={tagsOpen}
          className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <span>Tags</span>
          {tagsOpen ? (
            <ChevronUpIcon size={14} />
          ) : (
            <ChevronDownIcon size={14} />
          )}
        </button>
        {tagsOpen && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {tagFacets.length === 0 ? (
              <p className="px-2 py-1 text-xs text-slate-400">No tags</p>
            ) : (
              tagFacets.map((facet) => {
                const selected = selectedTags.includes(facet.value);
                return (
                  <button
                    key={facet.value}
                    type="button"
                    onClick={() => onTagToggle(facet.value)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 transition-colors",
                      selected
                        ? "bg-brand-600 text-white ring-brand-600"
                        : "bg-slate-100 text-slate-600 ring-slate-200 hover:bg-slate-200"
                    )}
                  >
                    #{facet.value}
                    <span className={cn(selected ? "text-brand-100" : "text-slate-400")}>
                      {facet.count}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </section>
    </aside>
  );
}