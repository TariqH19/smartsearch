/**
 * Frontend API contract types.
 *
 * These mirror the backend response shapes for the endpoints the UI will
 * consume. They are deliberately decoupled from backend implementation files:
 * only the JSON contract matters here, so a server-side refactor that keeps
 * the same JSON does not require touching the frontend.
 */

import type { DOCUMENT_CATEGORIES } from "../shared/categories";

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

/** A document as returned by search endpoints. `content` is never included. */
export interface DocumentSummary {
  _id: string;
  title: string;
  description: string;
  category: DocumentCategory;
  tags: string[];
  author: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchHit {
  document: DocumentSummary;
  score?: number;
}

export interface SearchMeta {
  query: string;
  category?: string;
  tags: string[];
  sort: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  tookMs: number;
}

export interface SearchResponse {
  results: SearchHit[];
  meta: SearchMeta;
}

export interface FacetBucket {
  value: string;
  count: number;
}

export interface FacetResult {
  category: FacetBucket[];
  tags: FacetBucket[];
}

export interface AdvancedSearchMeta {
  query: string;
  category?: string;
  tags: string[];
  fuzzy: boolean;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  tookMs: number;
  engine: "atlas-search";
}

export interface AdvancedSearchResponse {
  results: Array<{ document: DocumentSummary; score: number }>;
  facets?: FacetResult;
  meta: AdvancedSearchMeta;
}

export interface SuggestResponse {
  query: string;
  suggestions: string[];
  tookMs: number;
}

export interface HealthResponse {
  status: string;
  uptime: number;
  timestamp: string;
  version: string;
}

export type MongoConnectionState = "connected" | "disconnected" | "unconfigured";

export interface ReadinessResponse {
  status: string;
  mongo: { state: MongoConnectionState; configured: boolean };
  timestamp: string;
}

export type AnalyticsEngine = "baseline" | "atlas";
export type AnalyticsDays = 7 | 30;

export interface AnalyticsOverview {
  range: {
    days: number;
    from: string;
    to: string;
    timezone: "UTC";
  };
  summary: {
    totalSearchRequests: number;
    zeroResultRequests: number;
  };
  engineUsage: Array<{
    engine: AnalyticsEngine;
    requestCount: number;
  }>;
  latencyByEngine: Array<{
    engine: AnalyticsEngine;
    requestCount: number;
    averageTookMs: number;
  }>;
  latencyPercentiles: {
    status: "deferred";
    reason: string;
  };
  topQueries: Array<{
    query: string;
    requestCount: number;
  }>;
  dailyVolume: Array<{
    date: string;
    requestCount: number;
  }>;
  filterUsage: {
    categoryFilterRequests: number;
    tagFilterRequests: number;
    categories: Array<{
      value: string;
      requestCount: number;
    }>;
    tags: Array<{
      value: string;
      requestCount: number;
    }>;
  };
}

/** Query parameters accepted by `GET /api/search`. */
export interface SearchRequest {
  q: string;
  category?: DocumentCategory;
  tags?: string[];
  page?: number;
  pageSize?: number;
  sort?: "relevance" | "created" | "updated";
}

/** Query parameters accepted by `GET /api/search/advanced`. */
export interface AdvancedSearchRequest {
  q: string;
  category?: DocumentCategory;
  tags?: string[];
  page?: number;
  pageSize?: number;
  fuzzy?: boolean;
  fuzzyMaxEdits?: number;
  fuzzyPrefixLength?: number;
  facets?: boolean;
}

/** Query parameters accepted by `GET /api/search/suggest`. */
export interface SuggestRequest {
  q: string;
  limit?: number;
}