import { Router } from "express";
import { ApiError } from "../middleware/error.js";
import { createSearchEvent } from "../search/analytics.js";
import type { SearchEventRecorder } from "../search/analytics-service.js";
import { parseSearchParams } from "../search/query.js";
import { parseAdvancedSearchParams } from "../search/advanced-query.js";
import { parseSuggestParams } from "../search/suggest-query.js";
import type { AdvancedSearchService } from "../search/advanced-service.js";
import type { SearchService } from "../search/service.js";

export interface SearchRouterOptions {
  service?: SearchService;
  advanced?: AdvancedSearchService;
  analytics?: SearchEventRecorder;
  logger?: { warn(message: string): void };
  /**
   * Default for the `facets` query parameter. Facets are opt-in because they
   * require extra `token`-typed index fields and add a second aggregation.
   */
  includeFacets?: boolean;
}

function parseBooleanFlag(
  value: unknown,
  fallback: boolean
): boolean {
  if (value === undefined) {
    return fallback;
  }
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") {
    return fallback;
  }
  const normalised = raw.trim().toLowerCase();
  if (normalised === "true" || normalised === "1") {
    return true;
  }
  if (normalised === "false" || normalised === "0") {
    return false;
  }
  return fallback;
}

/**
 * Thin HTTP layer: parse, delegate, respond.
 * All validation and data access live in the search layer.
 */
export function createSearchRouter(options: SearchRouterOptions = {}) {
  const { service, advanced, includeFacets = false } = options;
  const analytics = options.analytics;
  const warn = options.logger?.warn ?? console.warn;
  const router = Router();

  const scheduleEvent = (
    event: () => ReturnType<typeof createSearchEvent>
  ): void => {
    if (!analytics) {
      return;
    }

    setImmediate(() => {
      try {
        analytics.recordSearchEvent(event());
      } catch {
        warn("[smartsearch] search analytics event write failed");
      }
    });
  };

  // Baseline $text search (Phase 2B).
  router.get("/search", async (req, res, next) => {
    if (!service) {
      next(new ApiError(503, "Search is not configured"));
      return;
    }

    const parsed = parseSearchParams(req.query as Record<string, unknown>);
    if (!parsed.ok) {
      next(new ApiError(400, "Invalid search parameters", { errors: parsed.errors }));
      return;
    }

    try {
      const response = await service.search(parsed.query);
      res.json(response);
      scheduleEvent(() =>
        createSearchEvent({
          engine: "baseline",
          query: parsed.query.q,
          resultCount: response.meta.total,
          tookMs: response.meta.tookMs,
          category: parsed.query.category,
          tags: parsed.query.tags,
        })
      );
    } catch (error) {
      next(error);
    }
  });

  // Atlas Search text + filters + relevance (Phase 2C).
  router.get("/search/advanced", async (req, res, next) => {
    if (!advanced) {
      next(new ApiError(503, "Advanced search is not configured"));
      return;
    }

    const parsed = parseAdvancedSearchParams(req.query as Record<string, unknown>);
    if (!parsed.ok) {
      next(new ApiError(400, "Invalid search parameters", { errors: parsed.errors }));
      return;
    }

    try {
      const withFacets = parseBooleanFlag(req.query.facets, includeFacets);
      const response = await advanced.search(parsed.params, withFacets);
      res.json(response);
      scheduleEvent(() =>
        createSearchEvent({
          engine: "atlas",
          query: parsed.params.q,
          resultCount: response.meta.total,
          tookMs: response.meta.tookMs,
          category: parsed.params.category,
          tags: parsed.params.tags,
          facetsRequested: withFacets,
        })
      );
    } catch (error) {
      next(error);
    }
  });

  // Autocomplete suggestions (Phase 2C).
  router.get("/search/suggest", async (req, res, next) => {
    if (!advanced) {
      next(new ApiError(503, "Autocomplete is not configured"));
      return;
    }

    const parsed = parseSuggestParams(req.query as Record<string, unknown>);
    if (!parsed.ok) {
      next(new ApiError(400, "Invalid suggest parameters", { errors: parsed.errors }));
      return;
    }

    try {
      const response = await advanced.suggest(parsed.params);
      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  return router;
}