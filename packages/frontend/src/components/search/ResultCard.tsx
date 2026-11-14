import { Badge } from "../ui/Badge";
import { CATEGORY_LABELS } from "../../shared/categories";
import { cn } from "../../utils/cn";
import type { SearchHit } from "../../api/types";

export interface ResultCardProps {
  hit: SearchHit;
  onTitleClick?: (hit: SearchHit) => void;
  className?: string;
}

/**
 * Placeholder result card.
 *
 * Phase 3A renders static presentation only — no live data is wired yet. The
 * component is typed against the real `SearchHit` contract so it can be
 * dropped into the results list as soon as search requests are implemented.
 */
export function ResultCard({ hit, onTitleClick, className }: ResultCardProps) {
  const { document, score } = hit;
  const created = new Date(document.createdAt);
  const dateLabel = Number.isNaN(created.getTime())
    ? "Unknown date"
    : created.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });

  return (
    <article
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => onTitleClick?.(hit)}
          className="text-left text-base font-semibold text-slate-900 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 rounded"
        >
          {document.title}
        </button>
        {typeof score === "number" && (
          <span
            className="shrink-0 text-xs font-medium text-slate-400"
            title="Relevance score"
          >
            {score.toFixed(2)}
          </span>
        )}
      </div>

      <p className="mt-1 line-clamp-2 text-sm text-slate-600">
        {document.description}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone="brand">{CATEGORY_LABELS[document.category]}</Badge>
        {document.tags.slice(0, 3).map((tag) => (
          <Badge key={tag} tone="default">#{tag}</Badge>
        ))}
        {document.tags.length > 3 && (
          <Badge tone="default">+{document.tags.length - 3} more</Badge>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
        <span>{document.author}</span>
        <span>{dateLabel}</span>
      </div>
    </article>
  );
}