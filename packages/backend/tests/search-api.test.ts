import { describe, expect, it } from "vitest";
import supertest from "supertest";
import { createApp } from "../src/app.js";
import { ApiError } from "../src/middleware/error.js";
import { createSearchRouter } from "../src/routes/search.js";
import { createSearchService } from "../src/search/service.js";
import type { SearchRepository, SearchPage } from "../src/search/repository.js";
import type { SearchQuery } from "../src/search/query.js";
import type { DocumentRecord } from "../src/models/document.js";

const request = supertest;

function document(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    _id: "doc-0001",
    title: "Understanding aggregation pipelines",
    description: "A practical guide to aggregation pipelines in MongoDB.",
    content: "Aggregation pipelines transform documents through stages.",
    category: "data",
    tags: ["mongodb", "aggregation"],
    author: "Amara Okafor",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

class FakeRepository implements SearchRepository {
  readonly calls: SearchQuery[] = [];
  page: SearchPage = { hits: [], total: 0 };
  error: Error | undefined;

  async search(query: SearchQuery): Promise<SearchPage> {
    this.calls.push(query);
    if (this.error) {
      throw this.error;
    }
    return this.page;
  }
}

function appWith(repository: SearchRepository, now?: () => number) {
  const service = createSearchService(repository, now ? { now } : undefined);
  return createApp({ searchRouter: createSearchRouter({ service }) });
}

describe("GET /api/search", () => {
  it("returns 400 with details for invalid parameters", async () => {
    const repository = new FakeRepository();
    const res = await request(appWith(repository)).get("/api/search?page=0&sort=random");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid search parameters");
    expect(Array.isArray(res.body.details.errors)).toBe(true);
    expect(repository.calls).toHaveLength(0);
  });

  it("returns a well-formed response for a valid search", async () => {
    const repository = new FakeRepository();
    repository.page = {
      hits: [{ document: document() }],
      total: 1,
    };

    const res = await request(appWith(repository, () => 1000)).get(
      "/api/search?q=pipeline&category=data&tags=mongodb&page=1&pageSize=10"
    );

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].document.title).toMatch(/aggregation/i);
    expect(res.body.meta).toMatchObject({
      query: "pipeline",
      category: "data",
      tags: ["mongodb"],
      sort: "relevance",
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
      tookMs: 0,
    });
  });

  it("reports pagination metadata for multiple pages", async () => {
    const repository = new FakeRepository();
    repository.page = { hits: [], total: 45 };

    const res = await request(appWith(repository, () => 500)).get(
      "/api/search?page=2&pageSize=20"
    );

    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({
      total: 45,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });

  it("handles an empty query string by listing newest first", async () => {
    const repository = new FakeRepository();
    repository.page = { hits: [{ document: document() }], total: 1 };

    const res = await request(appWith(repository)).get("/api/search?q=");

    expect(res.status).toBe(200);
    expect(repository.calls[0]?.sort).toBe("created");
  });

  it("passes through validated filters to the repository", async () => {
    const repository = new FakeRepository();
    repository.page = { hits: [], total: 0 };

    await request(appWith(repository)).get(
      "/api/search?q=pipeline&category=data&tags=mongodb,aggregation"
    );

    expect(repository.calls[0]).toMatchObject({
      q: "pipeline",
      category: "data",
      tags: ["mongodb", "aggregation"],
      sort: "relevance",
    });
  });

  it("returns 503 when the database fails, without leaking details", async () => {
    const repository = new FakeRepository();
    repository.error = new Error("connection to cluster0-shard-00.mongodb.net failed");

    const res = await request(appWith(repository)).get("/api/search?q=test");

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("Search is temporarily unavailable");
    expect(JSON.stringify(res.body)).not.toMatch(/cluster0|mongodb\.net/);
  });

  it("returns 503 when search is not configured", async () => {
    const res = await request(createApp()).get("/api/search?q=test");

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("Search is not configured");
  });

  it("does not return the content field", async () => {
    const repository = new FakeRepository();
    repository.page = { hits: [{ document: document() }], total: 1 };

    const res = await request(appWith(repository)).get("/api/search?q=pipeline");

    expect(res.body.results[0].document.content).toBeUndefined();
  });

  it("includes a relevance score when present", async () => {
    const repository = new FakeRepository();
    repository.page = { hits: [{ document: document(), score: 2.5 }], total: 1 };

    const res = await request(appWith(repository)).get("/api/search?q=pipeline");

    expect(res.body.results[0].score).toBe(2.5);
  });

  it("returns an empty result set with zero counts", async () => {
    const repository = new FakeRepository();
    repository.page = { hits: [], total: 0 };

    const res = await request(appWith(repository)).get(
      "/api/search?q=definitelynotfound"
    );

    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
    expect(res.body.meta.total).toBe(0);
    expect(res.body.meta.totalPages).toBe(0);
    expect(res.body.meta.hasNextPage).toBe(false);
  });

  it("returns an empty page beyond the last page", async () => {
    const repository = new FakeRepository();
    repository.page = { hits: [], total: 5 };

    const res = await request(appWith(repository)).get("/api/search?page=99");

    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
    expect(res.body.meta.total).toBe(5);
    expect(res.body.meta.totalPages).toBe(1);
    expect(res.body.meta.hasNextPage).toBe(false);
    expect(res.body.meta.hasPreviousPage).toBe(true);
  });

  it("returns 400 when the page exceeds the depth limit", async () => {
    const repository = new FakeRepository();

    const res = await request(appWith(repository)).get("/api/search?page=1001");

    expect(res.status).toBe(400);
    expect(repository.calls).toHaveLength(0);
  });

  it("handles a filter combination that matches nothing", async () => {
    const repository = new FakeRepository();
    repository.page = { hits: [], total: 0 };

    const res = await request(appWith(repository)).get(
      "/api/search?category=security&tags=design-systems"
    );

    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });
});

describe("ApiError", () => {
  it("carries status code and optional details", () => {
    const error = new ApiError(400, "Bad request", { errors: ["x"] });

    expect(error.statusCode).toBe(400);
    expect(error.message).toBe("Bad request");
    expect(error.details).toEqual({ errors: ["x"] });
  });
});