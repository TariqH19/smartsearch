import { useState, useRef, type ReactNode } from "react";
import { AppHeader } from "../components/layout/AppHeader";
import { AppShell } from "../components/layout/AppShell";
import { SearchBar } from "../components/search/SearchBar";
import { FilterSidebar } from "../components/search/FilterSidebar";
import { apiClient, ApiError } from "../api/client";
import {
  runComparison,
  ENGINE_LABELS,
  type ComparisonEngine,
  type ComparisonOutcome,
} from "../components/search/comparisonService";
import { EnginePanel } from "../components/search/EnginePanel";
import { ComparisonSummary } from "../components/search/ComparisonSummary";
import type { SearchHit } from "../api/types";
import {
  type DocumentCategory,
  isDocumentCategory,
} from "../shared/categories";
import { SparklesIcon } from "../components/ui/Icons";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/search/EmptyState";

type CompareEngineKey = "baseline" | "atlas";

const ENGINE_DESCRIPTIONS: Record<CompareEngineKey, string> = {
  baseline: "MongoDB text query",
  atlas: "Fuzzy + stemming",
};

/**
 * Compare page orchestrator.
 *
 * Runs the same query and filters against both engines side by side. Each
 * engine owns its own loading, error and empty state, so a failure in one
 * never hides the other. Only the most recent comparison can update the UI.
 */
export interface ComparePageProps {
  header?: ReactNode;
}

export function ComparePage({ header }: ComparePageProps = {}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<DocumentCategory | undefined>(
    undefined
  );
  const [tags, setTags] = useState<string[]>([]);
  const [fuzzy, setFuzzy] = useState(true);

  const [baselineHits, setBaselineHits] = useState<SearchHit[]>([]);
  const [atlasHits, setAtlasHits] = useState<SearchHit[]>([]);
  const [baselineTotal, setBaselineTotal] = useState(0);
  const [atlasTotal, setAtlasTotal] = useState(0);
  const [baselineTookMs, setBaselineTookMs] = useState<number | undefined>(
    undefined
  );
  const [atlasTookMs, setAtlasTookMs] = useState<number | undefined>(undefined);
  const [baselineError, setBaselineError] = useState<string | null>(null);
  const [atlasError, setAtlasError] = useState<string | null>(null);
  const [baselineLoading, setBaselineLoading] = useState(false);
  const [atlasLoading, setAtlasLoading] = useState(false);
  const [outcome, setOutcome] = useState<ComparisonOutcome | null>(null);
  const [hasRun, setHasRun] = useState(false);

  // Monotonic sequence number rejects stale comparisons.
  const seq = useRef(0);

  const runComparisonQuery = async (value: string) => {
    const trimmed = value.trim();

    if (trimmed === "") {
      return;
    }

    const mySeq = ++seq.current;

    setBaselineLoading(true);
    setAtlasLoading(true);
    setBaselineError(null);
    setAtlasError(null);
    setHasRun(true);

    const request = {
      q: trimmed,
      category,
      tags,
      fuzzy,
    };

    const baselineEngine: ComparisonEngine = {
      run: async (r) => {
        try {
          const response = await apiClient.search({
            q: r.q,
            category: r.category as DocumentCategory | undefined,
            tags: r.tags,
            page: 1,
          });
          return {
            hits: response.results,
            total: response.meta.total,
            tookMs: response.meta.tookMs,
            error: null,
            ok: true,
          };
        } catch (err) {
          throw err instanceof ApiError ? new Error(err.message) : err;
        }
      },
    };

    const atlasEngine: ComparisonEngine = {
      run: async (r) => {
        try {
          const response = await apiClient.advancedSearch({
            q: r.q,
            category: r.category as DocumentCategory | undefined,
            tags: r.tags,
            page: 1,
            fuzzy: r.fuzzy,
            facets: true,
          });
          return {
            hits: response.results,
            total: response.meta.total,
            tookMs: response.meta.tookMs,
            error: null,
            ok: true,
          };
        } catch (err) {
          throw err instanceof ApiError ? new Error(err.message) : err;
        }
      },
    };

    const result = await runComparison(baselineEngine, atlasEngine, request);

    if (mySeq !== seq.current) {
      return;
    }

    setOutcome(result);

    setBaselineHits(result.baseline.hits);
    setAtlasHits(result.atlas.hits);
    setBaselineTotal(result.baseline.total);
    setAtlasTotal(result.atlas.total);
    setBaselineTookMs(result.baseline.tookMs);
    setAtlasTookMs(result.atlas.tookMs);
    setBaselineError(result.baseline.error);
    setAtlasError(result.atlas.error);
    setBaselineLoading(false);
    setAtlasLoading(false);
  };

  const handleSearchSubmit = (value: string) => {
    setQuery(value);
    void runComparisonQuery(value);
  };

  const handleRetryBaseline = () => {
    void runComparisonQuery(query);
  };

  const handleRetryAtlas = () => {
    void runComparisonQuery(query);
  };

  const handleClearAll = () => {
    setCategory(undefined);
    setTags([]);
  };

  const handleCategoryChange = (cat: string | undefined) => {
    setCategory(
      cat !== undefined && isDocumentCategory(cat) ? cat : undefined
    );
  };

  return (
    <AppShell
      header={header ?? <AppHeader />}
      sidebar={
        <FilterSidebar
          categoryFacets={[]}
          tagFacets={[]}
          selectedCategory={category}
          selectedTags={tags}
          onCategoryChange={handleCategoryChange}
          onTagToggle={(tag) =>
            setTags((current) =>
              current.includes(tag)
                ? current.filter((t) => t !== tag)
                : [...current, tag]
            )
          }
          onClearAll={handleClearAll}
        />
      }
      main={
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Engine comparison
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Run the same query against Baseline and Atlas Search side by side.
              Results, ordering and durations are each engine&apos;s native
              output.
            </p>
          </div>

          <div className="space-y-3">
            <SearchBar
              value={query}
              onChange={setQuery}
              onSubmit={handleSearchSubmit}
              loading={baselineLoading || atlasLoading}
              disabled={baselineLoading || atlasLoading}
            />
            <div className="flex flex-wrap items-center justify-center gap-3">
              <p className="text-sm text-slate-500">
                Comparing Baseline Search and Atlas Search side by side.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={fuzzy}
                onChange={(e) => setFuzzy(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
              />
              <SparklesIcon size={16} className="text-brand-600" />
              Atlas fuzzy matching
            </label>
            <span className="text-xs text-slate-400">
              Applies to Atlas Search only
            </span>
          </div>

          <div className="flex justify-center">
            <Button
              size="lg"
              loading={baselineLoading || atlasLoading}
              loadingLabel="Running comparison"
              disabled={baselineLoading || atlasLoading}
              onClick={() => {
                void runComparisonQuery(query);
              }}
            >
              Run comparison
            </Button>
          </div>

          {!hasRun ? (
            <EmptyState />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <EnginePanel
                  engine="baseline"
                  label={ENGINE_LABELS.baseline}
                  description={ENGINE_DESCRIPTIONS.baseline}
                  accent="slate"
                  hits={baselineHits}
                  loading={baselineLoading}
                  error={baselineError}
                  total={baselineTotal}
                  tookMs={baselineTookMs}
                  onRetry={handleRetryBaseline}
                />
                <EnginePanel
                  engine="atlas"
                  label={ENGINE_LABELS.atlas}
                  description={ENGINE_DESCRIPTIONS.atlas}
                  accent="brand"
                  hits={atlasHits}
                  loading={atlasLoading}
                  error={atlasError}
                  total={atlasTotal}
                  tookMs={atlasTookMs}
                  onRetry={handleRetryAtlas}
                />
              </div>

              {outcome && <ComparisonSummary outcome={outcome} />}
            </>
          )}
        </div>
      }
    />
  );
}
