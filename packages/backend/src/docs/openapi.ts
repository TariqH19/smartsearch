import type { JsonObject } from "swagger-ui-express";

export const openApiSpec: JsonObject = {
  openapi: "3.0.3",
  info: {
    title: "SmartSearch API",
    version: "0.1.0",
    description:
      "Public HTTP API for SmartSearch. No authentication is implemented. Search result documents omit their full content field.",
  },
  servers: [
    {
      url: "/api",
      description: "Current origin (local development or deployed backend)",
    },
  ],
  tags: [
    { name: "Health", description: "Process liveness and database readiness" },
    { name: "Search", description: "Baseline, Atlas Search, and autocomplete" },
    { name: "Analytics", description: "Aggregated search usage metrics" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Check API liveness",
        description:
          "Confirms the Express process can respond. This endpoint does not access MongoDB.",
        operationId: "getHealth",
        responses: {
          "200": {
            description: "The API process is responding.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
                example: {
                  status: "ok",
                  uptime: 123.45,
                  timestamp: "2026-11-15T20:00:00.000Z",
                  version: "0.1.0",
                },
              },
            },
          },
        },
      },
    },
    "/ready": {
      get: {
        tags: ["Health"],
        summary: "Check database readiness",
        description:
          "Checks whether the configured MongoDB connection is reachable. A 503 response means the API is alive but not ready to serve database-backed operations.",
        operationId: "getReadiness",
        responses: {
          "200": {
            description: "MongoDB is connected and ready.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ReadinessResponse" },
                example: {
                  status: "ready",
                  mongo: { state: "connected", configured: true },
                  timestamp: "2026-11-15T20:00:00.000Z",
                },
              },
            },
          },
          "503": {
            description: "MongoDB is unconfigured or disconnected.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ReadinessResponse" },
                example: {
                  status: "not_ready",
                  mongo: { state: "disconnected", configured: true },
                  timestamp: "2026-11-15T20:00:00.000Z",
                },
              },
            },
          },
        },
      },
    },
    "/search": {
      get: {
        tags: ["Search"],
        summary: "Search documents with MongoDB text search",
        description:
          "Uses MongoDB `$text` search when q is non-empty, with optional category/tag filters, pagination, and relevance/created/updated sorting. An empty or omitted q lists documents newest first by default. Search result documents never include content.",
        operationId: "searchDocuments",
        parameters: [
          { $ref: "#/components/parameters/Query" },
          { $ref: "#/components/parameters/Category" },
          { $ref: "#/components/parameters/Tags" },
          { $ref: "#/components/parameters/Page" },
          { $ref: "#/components/parameters/PageSize" },
          { $ref: "#/components/parameters/BaselineSort" },
        ],
        responses: {
          "200": {
            description: "A page of matching document summaries.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SearchResponse" },
                example: {
                  results: [
                    {
                      document: {
                        _id: "doc-0001",
                        title: "Understanding aggregation pipelines",
                        description:
                          "A practical guide to aggregation pipelines in MongoDB.",
                        category: "data",
                        tags: ["mongodb", "aggregation"],
                        author: "Amara Okafor",
                        createdAt: "2026-01-01T00:00:00.000Z",
                        updatedAt: "2026-01-02T00:00:00.000Z",
                      },
                      score: 2.5,
                    },
                  ],
                  meta: {
                    query: "pipeline",
                    category: "data",
                    tags: ["mongodb"],
                    sort: "relevance",
                    page: 1,
                    pageSize: 20,
                    total: 1,
                    totalPages: 1,
                    hasNextPage: false,
                    hasPreviousPage: false,
                    tookMs: 4,
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/InvalidSearchParameters" },
          "503": {
            description: "Search is unconfigured or MongoDB is unavailable.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                examples: {
                  unavailable: {
                    value: { error: "Search is temporarily unavailable" },
                  },
                  unconfigured: { value: { error: "Search is not configured" } },
                },
              },
            },
          },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/search/advanced": {
      get: {
        tags: ["Search"],
        summary: "Search documents with MongoDB Atlas Search",
        description:
          "Runs an Atlas Search compound query across title, description, and content, with optional category/tag filters and fuzzy matching. Results are ordered by Atlas relevance. Set facets=true to include category and tag buckets. Search result documents omit content.",
        operationId: "advancedSearchDocuments",
        parameters: [
          { $ref: "#/components/parameters/Query" },
          { $ref: "#/components/parameters/Category" },
          { $ref: "#/components/parameters/Tags" },
          { $ref: "#/components/parameters/Page" },
          { $ref: "#/components/parameters/PageSize" },
          { $ref: "#/components/parameters/Fuzzy" },
          { $ref: "#/components/parameters/FuzzyMaxEdits" },
          { $ref: "#/components/parameters/FuzzyPrefixLength" },
          { $ref: "#/components/parameters/Facets" },
        ],
        responses: {
          "200": {
            description: "A page of Atlas Search results and optional facets.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AdvancedSearchResponse" },
                example: {
                  results: [
                    {
                      document: {
                        _id: "doc-0001",
                        title: "Understanding aggregation pipelines",
                        description:
                          "A practical guide to aggregation pipelines in MongoDB.",
                        category: "data",
                        tags: ["mongodb", "aggregation"],
                        author: "Amara Okafor",
                        createdAt: "2026-01-01T00:00:00.000Z",
                        updatedAt: "2026-01-02T00:00:00.000Z",
                      },
                      score: 4.12,
                    },
                  ],
                  facets: {
                    category: [{ value: "data", count: 12 }],
                    tags: [{ value: "mongodb", count: 8 }],
                  },
                  meta: {
                    query: "pipeline",
                    category: "data",
                    tags: ["mongodb"],
                    fuzzy: true,
                    page: 1,
                    pageSize: 20,
                    total: 1,
                    totalPages: 1,
                    hasNextPage: false,
                    hasPreviousPage: false,
                    tookMs: 7,
                    engine: "atlas-search",
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/InvalidSearchParameters" },
          "503": {
            description: "Atlas Search is unavailable or not configured.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                examples: {
                  unavailable: {
                    value: { error: "Atlas Search is unavailable" },
                  },
                  unconfigured: {
                    value: { error: "Advanced search is not configured" },
                  },
                },
              },
            },
          },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/search/suggest": {
      get: {
        tags: ["Search"],
        summary: "Suggest document titles",
        description:
          "Uses the `documents_autocomplete` Atlas Search index over title. Empty and one-character queries return an empty suggestions array without querying Atlas. Suggestions are distinct titles ordered by search score.",
        operationId: "suggestDocumentTitles",
        parameters: [
          { $ref: "#/components/parameters/SuggestQuery" },
          { $ref: "#/components/parameters/SuggestLimit" },
        ],
        responses: {
          "200": {
            description: "Matching unique title suggestions.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SuggestResponse" },
                example: {
                  query: "mon",
                  suggestions: ["MongoDB Aggregation", "MongoDB Indexing"],
                  tookMs: 3,
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/InvalidSuggestParameters" },
          "503": {
            description: "Autocomplete is unconfigured or Atlas Search is unavailable.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                examples: {
                  unavailable: {
                    value: { error: "Atlas Search is unavailable" },
                  },
                  unconfigured: {
                    value: { error: "Autocomplete is not configured" },
                  },
                },
              },
            },
          },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/analytics/overview": {
      get: {
        tags: ["Analytics"],
        summary: "Get aggregate search analytics",
        description:
          "Returns aggregate activity, engine usage, average latency, daily volume, filter usage, and top-query request counts for the requested period. For privacy, every topQueries.query value is replaced with `[private query]`; this endpoint does not return readable search terms. Percentile latency reporting is explicitly deferred.",
        operationId: "getAnalyticsOverview",
        parameters: [{ $ref: "#/components/parameters/AnalyticsDays" }],
        responses: {
          "200": {
            description: "Aggregated search metrics for the requested UTC period.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AnalyticsOverview" },
                example: {
                  range: {
                    days: 7,
                    from: "2026-11-08T20:00:00.000Z",
                    to: "2026-11-15T20:00:00.000Z",
                    timezone: "UTC",
                  },
                  summary: {
                    totalSearchRequests: 42,
                    zeroResultRequests: 3,
                  },
                  engineUsage: [
                    { engine: "baseline", requestCount: 24 },
                    { engine: "atlas", requestCount: 18 },
                  ],
                  latencyByEngine: [
                    {
                      engine: "baseline",
                      requestCount: 24,
                      averageTookMs: 5.2,
                    },
                  ],
                  topQueries: [{ query: "[private query]", requestCount: 6 }],
                  dailyVolume: [{ date: "2026-11-14", requestCount: 8 }],
                  filterUsage: {
                    categoryFilterRequests: 10,
                    tagFilterRequests: 7,
                    categories: [{ value: "data", requestCount: 6 }],
                    tags: [{ value: "mongodb", requestCount: 5 }],
                  },
                  latencyPercentiles: {
                    status: "deferred",
                    reason:
                      "Percentile latency metrics are deferred until deployed MongoDB version support is verified.",
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/InvalidAnalyticsParameters" },
          "503": {
            description: "Analytics are unavailable or not configured.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                examples: {
                  unavailable: {
                    value: { error: "Analytics are temporarily unavailable" },
                  },
                  unconfigured: {
                    value: { error: "Analytics are not configured" },
                  },
                },
              },
            },
          },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
  },
  components: {
    parameters: {
      Query: {
        name: "q",
        in: "query",
        required: false,
        description:
          "Search text, maximum 200 characters. With omitted or empty text, baseline search browses newest documents while advanced search matches all documents subject to filters.",
        schema: { type: "string", maxLength: 200 },
        example: "aggregation pipelines",
      },
      SuggestQuery: {
        name: "q",
        in: "query",
        required: false,
        description:
          "Title prefix/query, trimmed and truncated to 100 characters. Inputs shorter than two characters return no suggestions.",
        schema: { type: "string" },
        example: "mongo",
      },
      Category: {
        name: "category",
        in: "query",
        required: false,
        description: "Exact document category filter.",
        schema: { $ref: "#/components/schemas/DocumentCategory" },
      },
      Tags: {
        name: "tags",
        in: "query",
        required: false,
        style: "form",
        explode: false,
        description:
          "Comma-separated tags. Input is lowercased and every supplied tag must match. Up to 10 tags, each containing letters, digits, or hyphens (maximum 40 characters).",
        schema: {
          type: "array",
          maxItems: 10,
          items: {
            type: "string",
            minLength: 1,
            maxLength: 40,
            pattern: "^[a-z0-9][a-z0-9-]{0,39}$",
          },
        },
        example: "mongodb,aggregation",
      },
      Page: {
        name: "page",
        in: "query",
        required: false,
        description: "One-based page number. Maximum supported page is 1000.",
        schema: { type: "integer", minimum: 1, maximum: 1000, default: 1 },
      },
      PageSize: {
        name: "pageSize",
        in: "query",
        required: false,
        description: "Number of results per page.",
        schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
      BaselineSort: {
        name: "sort",
        in: "query",
        required: false,
        description:
          "Baseline sort. Defaults to relevance for a non-empty q; defaults to created for an empty q. Relevance requires a non-empty q.",
        schema: {
          type: "string",
          enum: ["relevance", "created", "updated"],
        },
      },
      Fuzzy: {
        name: "fuzzy",
        in: "query",
        required: false,
        description: "Enable Atlas Search fuzzy matching. Accepts true/false or 1/0.",
        schema: { type: "boolean", default: true },
      },
      FuzzyMaxEdits: {
        name: "fuzzyMaxEdits",
        in: "query",
        required: false,
        description: "Maximum edit distance used by Atlas fuzzy matching.",
        schema: { type: "integer", minimum: 1, maximum: 2, default: 1 },
      },
      FuzzyPrefixLength: {
        name: "fuzzyPrefixLength",
        in: "query",
        required: false,
        description: "Number of leading characters that must match exactly.",
        schema: { type: "integer", minimum: 0, maximum: 3, default: 0 },
      },
      Facets: {
        name: "facets",
        in: "query",
        required: false,
        description:
          "Include category and tag facet buckets. Accepts true/false or 1/0; invalid values use the configured default (false in this application).",
        schema: { type: "boolean", default: false },
      },
      SuggestLimit: {
        name: "limit",
        in: "query",
        required: false,
        description: "Maximum number of distinct title suggestions.",
        schema: { type: "integer", minimum: 1, maximum: 10, default: 5 },
      },
      AnalyticsDays: {
        name: "days",
        in: "query",
        required: false,
        description: "Length of the trailing analytics window, in UTC days.",
        schema: { type: "integer", minimum: 1, maximum: 30, default: 7 },
      },
    },
    responses: {
      InvalidSearchParameters: {
        description: "One or more query parameters failed validation.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
            example: {
              error: "Invalid search parameters",
              details: { errors: ["page must be between 1 and 1000"] },
            },
          },
        },
      },
      InvalidSuggestParameters: {
        description: "One or more query parameters failed validation.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
            example: {
              error: "Invalid suggest parameters",
              details: { errors: ["limit must be between 1 and 10"] },
            },
          },
        },
      },
      InvalidAnalyticsParameters: {
        description: "The analytics period is outside the supported range.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
            example: {
              error: "Invalid analytics parameters",
              details: { errors: ["days must be an integer from 1 through 30"] },
            },
          },
        },
      },
      InternalError: {
        description: "Unexpected server error.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
            example: { error: "Internal Server Error" },
          },
        },
      },
    },
    schemas: {
      DocumentCategory: {
        type: "string",
        enum: ["engineering", "data", "devops", "security", "design", "product"],
      },
      DocumentSummary: {
        type: "object",
        description:
          "Public search projection. The stored content field is intentionally omitted.",
        required: [
          "_id",
          "title",
          "description",
          "category",
          "tags",
          "author",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          _id: { type: "string", example: "doc-0001" },
          title: { type: "string", example: "Understanding aggregation pipelines" },
          description: {
            type: "string",
            example: "A practical guide to aggregation pipelines in MongoDB.",
          },
          category: { $ref: "#/components/schemas/DocumentCategory" },
          tags: { type: "array", items: { type: "string" } },
          author: { type: "string", example: "Amara Okafor" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      SearchHit: {
        type: "object",
        required: ["document"],
        properties: {
          document: { $ref: "#/components/schemas/DocumentSummary" },
          score: {
            type: "number",
            description: "MongoDB text score; included when relevance sorting is used.",
          },
        },
      },
      SearchMeta: {
        type: "object",
        required: [
          "query",
          "tags",
          "sort",
          "page",
          "pageSize",
          "total",
          "totalPages",
          "hasNextPage",
          "hasPreviousPage",
          "tookMs",
        ],
        properties: {
          query: { type: "string" },
          category: { $ref: "#/components/schemas/DocumentCategory" },
          tags: { type: "array", items: { type: "string" } },
          sort: { type: "string", enum: ["relevance", "created", "updated"] },
          page: { type: "integer" },
          pageSize: { type: "integer" },
          total: { type: "integer" },
          totalPages: { type: "integer" },
          hasNextPage: { type: "boolean" },
          hasPreviousPage: { type: "boolean" },
          tookMs: { type: "number" },
        },
      },
      SearchResponse: {
        type: "object",
        required: ["results", "meta"],
        properties: {
          results: {
            type: "array",
            items: { $ref: "#/components/schemas/SearchHit" },
          },
          meta: { $ref: "#/components/schemas/SearchMeta" },
        },
      },
      FacetBucket: {
        type: "object",
        required: ["value", "count"],
        properties: {
          value: { type: "string" },
          count: { type: "integer" },
        },
      },
      Facets: {
        type: "object",
        required: ["category", "tags"],
        properties: {
          category: {
            type: "array",
            items: { $ref: "#/components/schemas/FacetBucket" },
          },
          tags: {
            type: "array",
            items: { $ref: "#/components/schemas/FacetBucket" },
          },
        },
      },
      AdvancedSearchMeta: {
        type: "object",
        required: [
          "query",
          "tags",
          "fuzzy",
          "page",
          "pageSize",
          "total",
          "totalPages",
          "hasNextPage",
          "hasPreviousPage",
          "tookMs",
          "engine",
        ],
        properties: {
          query: { type: "string" },
          category: { $ref: "#/components/schemas/DocumentCategory" },
          tags: { type: "array", items: { type: "string" } },
          fuzzy: { type: "boolean" },
          page: { type: "integer" },
          pageSize: { type: "integer" },
          total: { type: "integer" },
          totalPages: { type: "integer" },
          hasNextPage: { type: "boolean" },
          hasPreviousPage: { type: "boolean" },
          tookMs: { type: "number" },
          engine: { type: "string", enum: ["atlas-search"] },
        },
      },
      AdvancedSearchResponse: {
        type: "object",
        required: ["results", "meta"],
        properties: {
          results: {
            type: "array",
            items: {
              type: "object",
              required: ["document", "score"],
              properties: {
                document: { $ref: "#/components/schemas/DocumentSummary" },
                score: { type: "number" },
              },
            },
          },
          facets: { $ref: "#/components/schemas/Facets" },
          meta: { $ref: "#/components/schemas/AdvancedSearchMeta" },
        },
      },
      SuggestResponse: {
        type: "object",
        required: ["query", "suggestions", "tookMs"],
        properties: {
          query: { type: "string" },
          suggestions: { type: "array", items: { type: "string" } },
          tookMs: { type: "number" },
        },
      },
      HealthResponse: {
        type: "object",
        required: ["status", "uptime", "timestamp", "version"],
        properties: {
          status: { type: "string", enum: ["ok"] },
          uptime: { type: "number" },
          timestamp: { type: "string", format: "date-time" },
          version: { type: "string" },
        },
      },
      ReadinessResponse: {
        type: "object",
        required: ["status", "mongo", "timestamp"],
        properties: {
          status: { type: "string", enum: ["ready", "not_ready"] },
          mongo: {
            type: "object",
            required: ["state", "configured"],
            properties: {
              state: {
                type: "string",
                enum: ["connected", "disconnected", "unconfigured"],
              },
              configured: { type: "boolean" },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      AnalyticsOverview: {
        type: "object",
        required: [
          "range",
          "summary",
          "engineUsage",
          "latencyByEngine",
          "topQueries",
          "dailyVolume",
          "filterUsage",
          "latencyPercentiles",
        ],
        properties: {
          range: {
            type: "object",
            required: ["days", "from", "to", "timezone"],
            properties: {
              days: { type: "integer" },
              from: { type: "string", format: "date-time" },
              to: { type: "string", format: "date-time" },
              timezone: { type: "string", enum: ["UTC"] },
            },
          },
          summary: {
            type: "object",
            required: ["totalSearchRequests", "zeroResultRequests"],
            properties: {
              totalSearchRequests: { type: "integer" },
              zeroResultRequests: { type: "integer" },
            },
          },
          engineUsage: {
            type: "array",
            items: {
              type: "object",
              required: ["engine", "requestCount"],
              properties: {
                engine: { type: "string", enum: ["baseline", "atlas"] },
                requestCount: { type: "integer" },
              },
            },
          },
          latencyByEngine: {
            type: "array",
            items: {
              type: "object",
              required: ["engine", "requestCount", "averageTookMs"],
              properties: {
                engine: { type: "string", enum: ["baseline", "atlas"] },
                requestCount: { type: "integer" },
                averageTookMs: { type: "number" },
              },
            },
          },
          topQueries: {
            type: "array",
            description:
              "Readable search text is redacted; query is always `[private query]`.",
            items: {
              type: "object",
              required: ["query", "requestCount"],
              properties: {
                query: { type: "string", enum: ["[private query]"] },
                requestCount: { type: "integer" },
              },
            },
          },
          dailyVolume: {
            type: "array",
            items: {
              type: "object",
              required: ["date", "requestCount"],
              properties: {
                date: { type: "string", format: "date" },
                requestCount: { type: "integer" },
              },
            },
          },
          filterUsage: {
            type: "object",
            required: [
              "categoryFilterRequests",
              "tagFilterRequests",
              "categories",
              "tags",
            ],
            properties: {
              categoryFilterRequests: { type: "integer" },
              tagFilterRequests: { type: "integer" },
              categories: {
                type: "array",
                items: {
                  type: "object",
                  required: ["value", "requestCount"],
                  properties: {
                    value: { $ref: "#/components/schemas/DocumentCategory" },
                    requestCount: { type: "integer" },
                  },
                },
              },
              tags: {
                type: "array",
                items: {
                  type: "object",
                  required: ["value", "requestCount"],
                  properties: {
                    value: { type: "string" },
                    requestCount: { type: "integer" },
                  },
                },
              },
            },
          },
          latencyPercentiles: {
            type: "object",
            required: ["status", "reason"],
            properties: {
              status: { type: "string", enum: ["deferred"] },
              reason: { type: "string" },
            },
          },
        },
      },
      ErrorResponse: {
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string" },
          path: {
            type: "string",
            description: "Request path included by the JSON 404 handler.",
          },
          details: {
            type: "object",
            properties: {
              errors: { type: "array", items: { type: "string" } },
            },
            additionalProperties: true,
          },
        },
      },
    },
  },
};
