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

const env = loadEnvVars();

const mongo = createMongoConnection(
  { uri: env.mongoUri, dbName: env.mongoDb },
  { serverSelectionTimeoutMS: 5000 }
);

async function main() {
  // Connect on boot only when credentials are configured. A failure here is
  // logged and tolerated so the API still serves /api/health and /api/ready.
  await mongo.connect();

  const db = () => {
    const client = mongo.getClient();
    if (!client || !env.mongoDb) {
      throw new Error("MongoDB is not available");
    }
    return client.db(env.mongoDb);
  };

  // The search services resolve the database lazily so they never open a
  // second client and still work if the connection is (re)established.
  const search = createSearchService({
    search: async (query) => createSearchRepository(db()).search(query),
  });

  const advancedSearch = createAdvancedSearchService(
    { search: async (params) => createAdvancedSearchRepository(db()).search(params) },
    { facets: async (params) => createFacetRepository(db()).facets(params) },
    { suggest: async (params) => createSuggestRepository(db()).suggest(params) },
    { indexStatus: createIndexStatusProbe(db()) }
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
    search,
    advancedSearch,
    analytics,
  });

  const server = app.listen(env.port, () => {
    console.log(`[smartsearch] API listening on http://localhost:${env.port}`);
    console.log(`[smartsearch] Health:    http://localhost:${env.port}/api/health`);
    console.log(`[smartsearch] Ready:     http://localhost:${env.port}/api/ready`);
    console.log(`[smartsearch] Search:    http://localhost:${env.port}/api/search`);
    console.log(`[smartsearch] Advanced:  http://localhost:${env.port}/api/search/advanced`);
    console.log(`[smartsearch] Analytics: http://localhost:${env.port}/api/analytics/overview`);
    console.log(`[smartsearch] Suggest:   http://localhost:${env.port}/api/search/suggest`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[smartsearch] ${signal} received, shutting down...`);
    server.close(async () => {
      await mongo.disconnect();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();