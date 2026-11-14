import { describe, expect, it } from "vitest";
import { createApiClient } from "../api/client.js";
import { ApiError } from "../api/client.js";

/**
 * A minimal fetch stub that captures the request URL so the test can assert
 * on query-string serialisation without touching the network.
 */
function stubFetch(response: {
  ok: boolean;
  status: number;
  body: unknown;
}): typeof fetch {
  return (async () => {
    return {
      ok: response.ok,
      status: response.status,
      headers: new Map([["content-type", "application/json"]]),
      json: async () => response.body,
      text: async () => JSON.stringify(response.body),
    } as unknown as Response;
  }) as typeof fetch;
}

describe("api client query serialisation", () => {
  it("serializes supported analytics periods as days parameters", async () => {
    const captured: string[] = [];
    const client = createApiClient({
      fetch: ((input: RequestInfo | URL) => {
        captured.push(typeof input === "string" ? input : input.toString());
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Map([["content-type", "application/json"]]),
          json: async () => ({}),
        } as unknown as Response);
      }) as typeof fetch,
    });

    await client.analyticsOverview(7);
    await client.analyticsOverview(30);

    expect(captured).toEqual([
      "/api/analytics/overview?days=7",
      "/api/analytics/overview?days=30",
    ]);
  });

  it("joins array values with commas for the backend parser", async () => {
    let captured = "";
    const client = createApiClient({
      fetch: ((input: RequestInfo | URL) => {
        captured = typeof input === "string" ? input : input.toString();
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Map([["content-type", "application/json"]]),
          json: async () => ({ results: [], meta: { total: 0, tookMs: 0 } }),
        } as unknown as Response);
      }) as typeof fetch,
    });

    await client.search({ q: "security", tags: ["bug", "performance"] });

    expect(captured).toContain("tags=bug%2Cperformance");
    expect(captured).not.toContain("tags=bug&tags=performance");
  });

  it("omits empty tag arrays rather than sending tags=", async () => {
    let captured = "";
    const client = createApiClient({
      fetch: ((input: RequestInfo | URL) => {
        captured = typeof input === "string" ? input : input.toString();
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Map([["content-type", "application/json"]]),
          json: async () => ({ results: [], meta: { total: 0, tookMs: 0 } }),
        } as unknown as Response);
      }) as typeof fetch,
    });

    await client.search({ q: "security", tags: [] });

    expect(captured).not.toContain("tags=");
  });

  it("throws ApiError with the backend message on non-2xx", async () => {
    const client = createApiClient({
      fetch: stubFetch({
        ok: false,
        status: 400,
        body: { message: "Invalid search parameters" },
      }),
    });

    await expect(client.search({ q: "x" })).rejects.toThrow(ApiError);
    await expect(client.search({ q: "x" })).rejects.toMatchObject({
      status: 400,
      message: "Invalid search parameters",
    });
  });

  it("throws a safe generic message on unexpected failures", async () => {
    const client = createApiClient({
      fetch: stubFetch({
        ok: false,
        status: 503,
        body: { message: "Atlas Search is unavailable" },
      }),
    });

    await expect(
      client.advancedSearch({ q: "x", fuzzy: true, facets: true })
    ).rejects.toMatchObject({
      status: 503,
      message: "Atlas Search is unavailable",
    });
  });

  it("drops undefined optional params", async () => {
    let captured = "";
    const client = createApiClient({
      fetch: ((input: RequestInfo | URL) => {
        captured = typeof input === "string" ? input : input.toString();
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Map([["content-type", "application/json"]]),
          json: async () => ({ results: [], meta: { total: 0, tookMs: 0 } }),
        } as unknown as Response);
      }) as typeof fetch,
    });

    await client.search({ q: "security" });

    expect(captured).toContain("q=security");
    expect(captured).not.toContain("category=");
    expect(captured).not.toContain("page=");
  });
});