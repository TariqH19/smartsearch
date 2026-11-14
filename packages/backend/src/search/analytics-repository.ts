import type {
  Db,
  Document,
  IndexDescription,
  IndexSpecification,
} from "mongodb";
import {
  SEARCH_EVENT_RETENTION_SECONDS,
  SEARCH_EVENTS_COLLECTION,
  type AnalyticsDateRange,
  type SearchAnalyticsMetrics,
  type SearchEngine,
  type SearchEvent,
  type SearchEventRepository,
} from "./analytics.js";

export const SEARCH_EVENT_INDEXES: ReadonlyArray<{
  name: string;
  keys: IndexSpecification;
  expireAfterSeconds: number;
}> = [
  {
    name: "occurredAt_ttl_30d",
    keys: { occurredAt: 1 },
    expireAfterSeconds: SEARCH_EVENT_RETENTION_SECONDS,
  },
];

interface AnalyticsOverviewAggregate {
  summary: Array<{
    totalSearchRequests: number;
    zeroResultRequests: number;
    categoryFilterRequests: number;
    tagFilterRequests: number;
  }>;
  engineUsage: Array<{ _id: SearchEngine; requestCount: number }>;
  latencyByEngine: Array<{
    _id: SearchEngine;
    requestCount: number;
    averageTookMs: number | null;
  }>;
  topQueries: Array<{ _id: string; requestCount: number }>;
  dailyVolume: Array<{ _id: Date; requestCount: number }>;
  categoryUsage: Array<{ _id: string; requestCount: number }>;
  tagUsage: Array<{ _id: string; requestCount: number }>;
}

export function buildAnalyticsOverviewPipeline(
  range: AnalyticsDateRange
): Document[] {
  return [
    {
      $match: {
        occurredAt: { $gte: range.from, $lt: range.to },
      },
    },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalSearchRequests: { $sum: 1 },
              zeroResultRequests: {
                $sum: {
                  $cond: [{ $eq: ["$resultCount", 0] }, 1, 0],
                },
              },
              categoryFilterRequests: {
                $sum: {
                  $cond: ["$categoryFilterApplied", 1, 0],
                },
              },
              tagFilterRequests: {
                $sum: {
                  $cond: ["$tagFilterApplied", 1, 0],
                },
              },
            },
          },
        ],
        engineUsage: [
          { $group: { _id: "$engine", requestCount: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
        latencyByEngine: [
          {
            $group: {
              _id: "$engine",
              requestCount: { $sum: 1 },
              averageTookMs: { $avg: "$tookMs" },
            },
          },
          { $sort: { _id: 1 } },
        ],
        topQueries: [
          {
            $match: {
              normalizedQuery: { $type: "string", $ne: "" },
            },
          },
          {
            $group: {
              _id: "$normalizedQuery",
              requestCount: { $sum: 1 },
            },
          },
          { $sort: { requestCount: -1, _id: 1 } },
          { $limit: 10 },
        ],
        dailyVolume: [
          {
            $group: {
              _id: {
                $dateTrunc: {
                  date: "$occurredAt",
                  unit: "day",
                  timezone: "UTC",
                },
              },
              requestCount: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ],
        categoryUsage: [
          {
            $match: {
              categoryFilterApplied: true,
              category: { $type: "string" },
            },
          },
          { $group: { _id: "$category", requestCount: { $sum: 1 } } },
          { $sort: { requestCount: -1, _id: 1 } },
        ],
        tagUsage: [
          { $match: { tagFilterApplied: true } },
          { $unwind: "$tags" },
          { $group: { _id: "$tags", requestCount: { $sum: 1 } } },
          { $sort: { requestCount: -1, _id: 1 } },
        ],
      },
    },
  ];
}

function hasExpectedIndex(
  indexes: IndexDescription[],
  definition: (typeof SEARCH_EVENT_INDEXES)[number]
): boolean {
  return indexes.some((index) => {
    const keys = Object.entries(index.key ?? {});
    return (
      index.name === definition.name &&
      index.expireAfterSeconds === definition.expireAfterSeconds &&
      keys.length === 1 &&
      keys[0]?.[0] === "occurredAt" &&
      keys[0]?.[1] === 1
    );
  });
}

export async function createSearchAnalyticsIndexes(db: Db): Promise<string[]> {
  const collection = db.collection<SearchEvent>(SEARCH_EVENTS_COLLECTION);
  const names: string[] = [];

  for (const index of SEARCH_EVENT_INDEXES) {
    const name = await collection.createIndex(index.keys, {
      name: index.name,
      expireAfterSeconds: index.expireAfterSeconds,
    });
    names.push(name);
  }

  const indexes = await collection.indexes();
  const missing = SEARCH_EVENT_INDEXES.filter(
    (index) => !hasExpectedIndex(indexes, index)
  );
  if (missing.length > 0) {
    throw new Error(
      `Analytics index verification failed: ${missing.map((index) => index.name).join(", ")}`
    );
  }

  return names;
}

export function createSearchAnalyticsRepository(
  db: Db
): SearchEventRepository {
  const collection = db.collection<SearchEvent & Document>(
    SEARCH_EVENTS_COLLECTION
  );

  const record = async (event: SearchEvent): Promise<void> => {
    await collection.insertOne(event);
  };

  const overview = async (
    range: AnalyticsDateRange
  ): Promise<SearchAnalyticsMetrics> => {
    const rows = await collection
      .aggregate<AnalyticsOverviewAggregate>(
        buildAnalyticsOverviewPipeline(range)
      )
      .toArray();
    const result = rows[0];
    const summary = result?.summary[0];

    return {
      summary: {
        totalSearchRequests: summary?.totalSearchRequests ?? 0,
        zeroResultRequests: summary?.zeroResultRequests ?? 0,
      },
      engineUsage: (result?.engineUsage ?? []).map((entry) => ({
        engine: entry._id,
        requestCount: entry.requestCount,
      })),
      latencyByEngine: (result?.latencyByEngine ?? []).map((entry) => ({
        engine: entry._id,
        requestCount: entry.requestCount,
        averageTookMs: entry.averageTookMs ?? 0,
      })),
      topQueries: (result?.topQueries ?? []).map((entry) => ({
        query: entry._id,
        requestCount: entry.requestCount,
      })),
      dailyVolume: (result?.dailyVolume ?? []).map((entry) => ({
        date: entry._id.toISOString().slice(0, 10),
        requestCount: entry.requestCount,
      })),
      filterUsage: {
        categoryFilterRequests: summary?.categoryFilterRequests ?? 0,
        tagFilterRequests: summary?.tagFilterRequests ?? 0,
        categories: (result?.categoryUsage ?? []).map((entry) => ({
          value: entry._id,
          requestCount: entry.requestCount,
        })),
        tags: (result?.tagUsage ?? []).map((entry) => ({
          value: entry._id,
          requestCount: entry.requestCount,
        })),
      },
    };
  };

  return { record, overview };
}
