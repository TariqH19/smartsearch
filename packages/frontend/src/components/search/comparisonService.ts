/**
 * Pure comparison logic for the Search Engine Comparison experience.
 *
 * Extracted from the React layer so the core behaviour — running both
 * engines against the same query, keeping only the latest run, and computing
 * the comparison summary — can be unit-tested without a DOM.
 */

import type { SearchHit } from "../../api/types";

export interface ComparisonRequest {
  q: string;
  category?: string;
  tags: string[];
  fuzzy: boolean;
}

export interface EngineResult {
  hits: SearchHit[];
  total: number;
  tookMs: number;
  error: string | null;
  ok: boolean;
}

export interface ComparisonOutcome {
  baseline: EngineResult;
  atlas: EngineResult;
  bothSucceeded: boolean;
  atLeastOneSucceeded: boolean;
  countDelta: number;
  fasterEngine: "baseline" | "atlas" | "tie" | null;
  durationDeltaMs: number;
}

export interface ComparisonEngine {
  run(request: ComparisonRequest): Promise<EngineResult>;
}

/**
 * Runs both engines and returns a structured outcome.
 *
 * Failures are isolated: one engine failing must not hide the other's
 * results. Each engine's `error` is a safe, user-facing string.
 */
export async function runComparison(
  baselineEngine: ComparisonEngine,
  atlasEngine: ComparisonEngine,
  request: ComparisonRequest
): Promise<ComparisonOutcome> {
  const [baselineResult, atlasResult] = await Promise.allSettled([
    baselineEngine.run(request),
    atlasEngine.run(request),
  ]);

  const baseline = toEngineResult(baselineResult);
  const atlas = toEngineResult(atlasResult);

  const bothSucceeded = baseline.ok && atlas.ok;
  const atLeastOneSucceeded = baseline.ok || atlas.ok;

  let countDelta = 0;
  if (baseline.ok && atlas.ok) {
    countDelta = atlas.total - baseline.total;
  }

  let fasterEngine: ComparisonOutcome["fasterEngine"] = null;
  let durationDeltaMs = 0;
  if (baseline.ok && atlas.ok) {
    durationDeltaMs = atlas.tookMs - baseline.tookMs;
    if (baseline.tookMs < atlas.tookMs) {
      fasterEngine = "baseline";
    } else if (atlas.tookMs < baseline.tookMs) {
      fasterEngine = "atlas";
    } else {
      fasterEngine = "tie";
    }
  }

  return {
    baseline,
    atlas,
    bothSucceeded,
    atLeastOneSucceeded,
    countDelta,
    fasterEngine,
    durationDeltaMs,
  };
}

function toEngineResult(
  result: PromiseSettledResult<EngineResult>
): EngineResult {
  if (result.status === "fulfilled") {
    return result.value;
  }
  const reason = result.reason;
  if (typeof reason === "object" && reason !== null && "message" in reason) {
    return {
      hits: [],
      total: 0,
      tookMs: 0,
      error: String((reason as { message: unknown }).message),
      ok: false,
    };
  }
  if (reason instanceof Error) {
    return { hits: [], total: 0, tookMs: 0, error: reason.message, ok: false };
  }
  return {
    hits: [],
    total: 0,
    tookMs: 0,
    error: "Search is temporarily unavailable",
    ok: false,
  };
}

/** Engine labels used by the UI. */
export const ENGINE_LABELS: Record<"baseline" | "atlas", string> = {
  baseline: "Baseline Search",
  atlas: "Atlas Search",
};

/** Formats a millisecond duration for display. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return "—";
  }
  if (ms < 1000) {
    return `${Math.round(ms)} ms`;
  }
  return `${(ms / 1000).toFixed(2)} s`;
}

/** Returns a human-readable label for the faster engine, or null when the
 *  comparison cannot be made. */
export function fasterEngineLabel(
  faster: ComparisonOutcome["fasterEngine"]
): string | null {
  switch (faster) {
    case "baseline":
      return "Baseline Search reported the lower duration";
    case "atlas":
      return "Atlas Search reported the lower duration";
    case "tie":
      return "Both engines reported the same duration";
    default:
      return null;
  }
}