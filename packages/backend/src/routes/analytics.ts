import { Router } from "express";
import { ApiError } from "../middleware/error.js";
import { parseAnalyticsDays } from "../search/analytics-query.js";
import type { AnalyticsService } from "../search/analytics-service.js";

export interface AnalyticsRouterOptions {
  service?: AnalyticsService;
}

export function createAnalyticsRouter(options: AnalyticsRouterOptions = {}) {
  const router = Router();

  router.get("/analytics/overview", async (req, res, next) => {
    if (!options.service) {
      next(new ApiError(503, "Analytics are not configured"));
      return;
    }

    const parsed = parseAnalyticsDays(req.query as Record<string, unknown>);
    if (parsed.ok === false) {
      next(
        new ApiError(400, "Invalid analytics parameters", {
          errors: parsed.errors,
        })
      );
      return;
    }

    try {
      res.json(await options.service.overview(parsed.days));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
