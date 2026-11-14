import { createRequire } from "node:module";
import cors from "cors";
import express, {
  type Express,
  type RequestHandler,
  type Router,
} from "express";
import type { MongoConnection } from "./config/mongo.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { createAnalyticsRouter } from "./routes/analytics.js";
import { createHealthRouter } from "./routes/health.js";
import { createSearchRouter } from "./routes/search.js";
import type { AnalyticsService } from "./search/analytics-service.js";
import type { AdvancedSearchService } from "./search/advanced-service.js";
import type { SearchService } from "./search/service.js";

const helmet = createRequire(import.meta.url)("helmet") as () => RequestHandler;

export interface AppOptions {
  corsOrigin?: string | string[];
  mongo?: MongoConnection;
  search?: SearchService;
  advancedSearch?: AdvancedSearchService;
  analytics?: AnalyticsService;
  includeFacets?: boolean;
  healthRouter?: Router;
  searchRouter?: Router;
  analyticsRouter?: Router;
}

export function createApp(options: AppOptions = {}): Express {
  const {
    corsOrigin = ["http://localhost:5173", "http://127.0.0.1:5173"],
    mongo,
    search,
    advancedSearch,
    analytics,
    includeFacets = false,
  } = options;
  const healthRouter = options.healthRouter ?? createHealthRouter({ mongo });
  const searchRouter =
    options.searchRouter ??
    createSearchRouter({
      service: search,
      advanced: advancedSearch,
      includeFacets,
      analytics,
    });
  const analyticsRouter =
    options.analyticsRouter ?? createAnalyticsRouter({ service: analytics });

  const app = express();

  app.use(helmet());
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json());

  app.use("/api", healthRouter);
  app.use("/api", analyticsRouter);
  app.use("/api", searchRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}