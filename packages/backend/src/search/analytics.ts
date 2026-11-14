import type { SearchSort } from "./query.js";

export const SEARCH_EVENTS_COLLECTION = "search_events";
export const SEARCH_EVENT_RETENTION_DAYS = 30;
export const SEARCH_EVENT_RETENTION_SECONDS =
  SEARCH_EVENT_RETENTION_DAYS * 24 * 60 * 60;
export const MAX_STORED_QUERY_LENGTH = 120;

export type SearchEngine = "baseline" | "atlas";

export interface SearchEvent {
  occurredAt: Date;
  engine: SearchEngine;
  normalizedQuery: string | null;
  resultCount: number;
  tookMs: number;
  category?: string;
  tags: string[];
  categoryFilterApplied: boolean;
  tagFilterApplied: boolean;
  facetsRequested?: boolean;
}

export interface SearchEventInput {
  engine: SearchEngine;
  query: string;
  resultCount: number;
  tookMs: number;
  category?: string;
  tags: string[];
  facetsRequested?: boolean;
}

export interface AnalyticsRange {
  days: number;
  from: string;
  to: string;
  timezone: "UTC";
}

export interface SearchAnalyticsSummary {
  totalSearchRequests: number;
  zeroResultRequests: number;
}

export interface EngineUsage {
  engine: SearchEngine;
  requestCount: number;
}

export interface EngineLatency {
  engine: SearchEngine;
  requestCount: number;
  averageTookMs: number;
}

export interface QueryUsage {
  query: string;
  requestCount: number;
}

export interface DailySearchVolume {
  date: string;
  requestCount: number;
}

export interface FilterValueUsage {
  value: string;
  requestCount: number;
}

export interface SearchAnalyticsMetrics {
  summary: SearchAnalyticsSummary;
  engineUsage: EngineUsage[];
  latencyByEngine: EngineLatency[];
  topQueries: QueryUsage[];
  dailyVolume: DailySearchVolume[];
  filterUsage: {
    categoryFilterRequests: number;
    tagFilterRequests: number;
    categories: FilterValueUsage[];
    tags: FilterValueUsage[];
  };
}

export interface SearchAnalyticsOverview extends SearchAnalyticsMetrics {
  range: AnalyticsRange;
  latencyPercentiles: {
    status: "deferred";
    reason: string;
  };
}

const EMAIL_PATTERN =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN =
  /(?<![\p{L}\p{N}])\+?(?:\d[\s().-]*){6,14}\d(?![\p{L}\p{N}])/gu;

/**
 * Produces a bounded, lower-case query value for analytics storage.
 *
 * Email and phone matching is deliberately basic; it is not comprehensive
 * sensitive-data detection. Keep event retention short and do not treat this
 * value as guaranteed anonymous.
 */
function stripControlCharacters(value: string): string {
  return Array.from(value).reduce((result, character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? `${result} ` : `${result}${character}`;
  }, "");
}

export function normalizeSearchQuery(query: string): string | null {
  const normalized = stripControlCharacters(query.normalize("NFKC"))
    .replace(/\s+/g, " ")
    .trim()
    .replace(EMAIL_PATTERN, "[email]")
    .replace(PHONE_PATTERN, "[phone]")
    .toLowerCase()
    .slice(0, MAX_STORED_QUERY_LENGTH)
    .trim();

  return normalized === "" ? null : normalized;
}

export function createSearchEvent(
  input: SearchEventInput,
  occurredAt = new Date()
): SearchEvent {
  const event: SearchEvent = {
    occurredAt,
    engine: input.engine,
    normalizedQuery: normalizeSearchQuery(input.query),
    resultCount: input.resultCount,
    tookMs: input.tookMs,
    ...(input.category !== undefined ? { category: input.category } : {}),
    tags: [...input.tags],
    categoryFilterApplied: input.category !== undefined,
    tagFilterApplied: input.tags.length > 0,
    ...(input.engine === "atlas"
      ? { facetsRequested: input.facetsRequested ?? false }
      : {}),
  };

  return event;
}

export interface AnalyticsDateRange {
  from: Date;
  to: Date;
}

export interface SearchEventRepository {
  record(event: SearchEvent): Promise<void>;
  overview(range: AnalyticsDateRange): Promise<SearchAnalyticsMetrics>;
}

export type AnalyticsSearchSort = SearchSort;
