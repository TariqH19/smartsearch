import { cn } from "../../utils/cn";
import { Badge } from "../ui/Badge";
import { SearchIcon, SparklesIcon } from "../ui/Icons";
import type { ReactNode } from "react";

export type SearchEngine = "baseline" | "atlas";

export interface EngineOption {
  id: SearchEngine;
  label: string;
  description: string;
  icon: ReactNode;
}

const ENGINES: EngineOption[] = [
  {
    id: "baseline",
    label: "Baseline Search",
    description: "MongoDB $text query",
    icon: <SearchIcon size={16} />,
  },
  {
    id: "atlas",
    label: "Atlas Search",
    description: "Fuzzy + stemming",
    icon: <SparklesIcon size={16} />,
  },
];

export interface SearchEngineSelectorProps {
  value: SearchEngine;
  onChange: (engine: SearchEngine) => void;
  className?: string;
}

export function SearchEngineSelector({
  value,
  onChange,
  className,
}: SearchEngineSelectorProps) {
  return (
    <div
      role="group"
      aria-label="Search engine"
      className={cn(
        "inline-flex w-full rounded-lg border border-slate-200 bg-slate-50 p-1 sm:w-auto",
        className
      )}
    >
      {ENGINES.map((engine) => {
        const selected = engine.id === value;
        return (
          <button
            key={engine.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(engine.id)}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              selected
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            {engine.icon}
            <span>{engine.label}</span>
            {engine.id === "atlas" && (
              <Badge tone="brand" className="hidden sm:inline-flex">
                Atlas
              </Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}