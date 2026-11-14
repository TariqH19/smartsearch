import { createApp } from "./app.js";
import { loadEnvVars } from "./config/env.js";
import { createMongoConnection } from "./config/mongo.js";
import type { AnalyticsDateRange, SearchEvent } from "./search/analytics.js";
import { createSearchAnalyticsRepository } from "./search/analytics-repository.js";
import { createAnalyticsService } from "./search/analytics-service.js";
import { createAdvancedSearchRepository } from "./search/advanced-repository.js";
import { createAdvancedSearchService } from "./search/advanced-service.js";
import { createIndexStatusProbe } from "./search/atlas-status.js";
import { createFacetRepository } from "./search/facet-repository.js";
import { createSearchRepository } from "./search/repository.js";
import { createSearchService } from "./search/service.js";
import { createSuggestRepository } from "./search/suggest-repository.js";

export function createBackendRuntime(options: { connectMongoOnRequest?: boolean } = {}) {
  const env = loadEnvVars();
  const mongo = createMongoConnection(
    { uri: env.mongoUri, dbName: env.mongoDb },
    { serverSelectionTimeoutMS: 5000 }
  );
  const db = () => {
    const client = mongo.getClient();
    if (!client || !env.mongoDb) {
      throw new Error("MongoDB is not available");
    }
    return client.db(env.mongoDb);
  };

  const search = createSearchService({
    search: async (query) => createSearchRepository(db()).search(query),
  });

  const advancedSearch = createAdvancedSearchService(
    { search: async (params) => createAdvancedSearchRepository(db()).search(params) },
    { facets: async (params) => createFacetRepository(db()).facets(params) },
    { suggest: async (params) => createSuggestRepository(db()).suggest(params) },
    { indexStatus: createIndexStatusProbe(db) }
  );

  const analyticsRepository = {
    record: (event: SearchEvent) =>
      createSearchAnalyticsRepository(db()).record(event),
    overview: (range: AnalyticsDateRange) =>
      createSearchAnalyticsRepository(db()).overview(range),
  };
  const analytics = createAnalyticsService(analyticsRepository);
  const app = createApp({
    corsOrigin: env.corsOrigin,
    mongo,
    connectMongoOnRequest: options.connectMongoOnRequest,
    search,
    advancedSearch,
    analytics,
  });

  return { app, mongo, port: env.port };
}
