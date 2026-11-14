/**
 * Thin typed HTTP client for the SmartSearch backend.
 *
 * The base URL comes from `VITE_API_URL` (a public Vite env var). In
 * development the Vite dev server proxies `/api` to the backend, so the
 * default is empty and requests are relative — no port coupling in source.
 *
 * Only non-secret frontend configuration is read from the environment. No
 * MongoDB credentials, connection strings, or backend secrets are ever
 * included in the client bundle.
 */

import type {
  AdvancedSearchRequest,
  AdvancedSearchResponse,
  AnalyticsDays,
  AnalyticsOverview,
  HealthResponse,
  ReadinessResponse,
  SearchRequest,
  SearchResponse,
  SuggestRequest,
  SuggestResponse,
} from "./types.js";

export interface ApiClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function resolveBaseUrl(): string {
  // Vite exposes env vars prefixed with VITE_ to the client bundle.
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const configured = env?.VITE_API_URL?.trim();
  return configured ? configured.replace(/\/+$/, "") : "";
}

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? resolveBaseUrl()).replace(/\/+$/, "");
  const fetchFn = options.fetch ?? fetch;

  async function request<T>(
    path: string,
    init: RequestInit = {}
  ): Promise<T> {
    const url = path.startsWith("http")
      ? path
      : `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;

    const response = await fetchFn(url, init);

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = undefined;
      }
      const message =
        (body as { message?: string } | undefined)?.message ??
        `Request failed with status ${response.status}`;
      throw new ApiError(message, response.status, body);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new ApiError(
        `Expected JSON but received "${contentType || "unknown"}"`,
        response.status
      );
    }

    return (await response.json()) as T;
  }

  const get = <T>(path: string, init?: RequestInit) =>
    request<T>(path, init);

  return {
    /** Liveness check. Never touches MongoDB. */
    health: () => get<HealthResponse>("/api/health"),

    /**
     * Readiness check. Verifies the real MongoDB state. 200 when connected,
     * 503 otherwise. The response only exposes the coarse state, never the
     * URI or credentials.
     */
    ready: () => get<ReadinessResponse>("/api/ready"),

    /** Baseline MongoDB `$text` search. */
    search: (params: SearchRequest) =>
      get<SearchResponse>(
        "/api/search?" + new URLSearchParams(toQueryString(params)).toString()
      ),

    /** Atlas Search with fuzzy matching and English stemming. */
    advancedSearch: (params: AdvancedSearchRequest) =>
      get<AdvancedSearchResponse>(
        "/api/search/advanced?" +
          new URLSearchParams(toQueryString(params)).toString()
      ),

    /** Autocomplete suggestions. */
    suggest: (params: SuggestRequest) =>
      get<SuggestResponse>(
        "/api/search/suggest?" +
          new URLSearchParams(toQueryString(params)).toString()
      ),

    /** Aggregated search analytics for a supported dashboard period. */
    analyticsOverview: (days: AnalyticsDays) =>
      get<AnalyticsOverview>(
        "/api/analytics/overview?" +
          new URLSearchParams(toQueryString({ days })).toString()
      ),
  };
}

/** Default client instance for the app. */
export const apiClient = createApiClient();

/**
 * Serialise request params into a query string, dropping undefined values.
 *
 * Array values are joined with commas (`tags=a,b`) because the backend
 * parser (`parseTags` in `packages/backend/src/search/query.ts`) reads a
 * single `tags` value and splits it on `,`. Serialising as repeated keys
 * (`tags=a&tags=b`) would silently drop all but the first tag, since the
 * backend only ever reads the first element of an array.
 */
function toQueryString(params: unknown): Record<string, string> {
  if (params === null || typeof params !== "object" || Array.isArray(params)) {
    return {};
  }

  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      const joined = value
        .filter((item): item is string => typeof item === "string" && item !== "")
        .join(",");
      if (joined !== "") {
        query[key] = joined;
      }
    } else {
      query[key] = String(value);
    }
  }
  return query;
}

export type ApiClient = ReturnType<typeof createApiClient>;