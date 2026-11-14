import { ApiError } from "../middleware/error.js";
import type {
  AnalyticsDateRange,
  SearchAnalyticsOverview,
  SearchEvent,
  SearchEventRepository,
} from "./analytics.js";

export interface SearchEventRecorder {
  recordSearchEvent(event: SearchEvent): void;
}

export interface AnalyticsService extends SearchEventRecorder {
  overview(days: number): Promise<SearchAnalyticsOverview>;
}

export interface AnalyticsServiceOptions {
  now?: () => Date;
  logger?: {
    warn(message: string): void;
    error(message: string): void;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PRIVATE_QUERY_LABEL = "[private query]";
const PERCENTILE_STATUS = {
  status: "deferred" as const,
  reason:
    "Percentile latency metrics are deferred until deployed MongoDB version support is verified.",
};

function redactTopQueries(
  queries: Array<{ query: string; requestCount: number }>
): Array<{ query: string; requestCount: number }> {
  return queries.map((entry) => ({
    query: PRIVATE_QUERY_LABEL,
    requestCount: entry.requestCount,
  }));
}

export function createAnalyticsService(
  repository: SearchEventRepository,
  options: AnalyticsServiceOptions = {}
): AnalyticsService {
  const now = options.now ?? (() => new Date());
  const logger = options.logger ?? console;

  const recordSearchEvent = (event: SearchEvent): void => {
    const warn = () => {
      logger.warn("[smartsearch] search analytics event write failed");
    };

    try {
      void repository.record(event).catch(warn);
    } catch {
      warn();
    }
  };

  const overview = async (days: number): Promise<SearchAnalyticsOverview> => {
    const to = new Date(now().getTime());
    const from = new Date(to.getTime() - days * DAY_MS);
    const range: AnalyticsDateRange = { from, to };

    try {
      const metrics = await repository.overview(range);
      return {
        ...metrics,
        topQueries: redactTopQueries(metrics.topQueries),
        range: {
          days,
          from: from.toISOString(),
          to: to.toISOString(),
          timezone: "UTC",
        },
        latencyPercentiles: PERCENTILE_STATUS,
      };
    } catch (error) {
      logger.error(
        "[smartsearch] analytics overview failed: " +
          (error instanceof Error ? error.name : typeof error)
      );
      throw new ApiError(503, "Analytics are temporarily unavailable");
    }
  };

  return { recordSearchEvent, overview };
}
