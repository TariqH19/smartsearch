import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import {
  createSearchRepository,
  type Projection,
} from "../src/search/repository.js";
import type { DocumentRecord } from "../src/models/document.js";
import type { SearchQuery } from "../src/search/query.js";

function query(overrides: Partial<SearchQuery> = {}): SearchQuery {
  return {
    q: "pipeline",
    tags: [],
    page: 1,
    pageSize: 20,
    sort: "relevance",
    ...overrides,
  };
}

interface FindCall {
  filter: unknown;
  options: { projection?: Projection; sort?: unknown; skip?: number; limit?: number };
}

/**
 * Minimal fake collection that records the exact arguments passed to `find`,
 * so tests can assert on real repository behaviour rather than on a mock
 * repository that already supplies a score.
 */
class FakeCollection {
  readonly calls: FindCall[] = [];
  readonly countCalls: unknown[] = [];
  documents: Array<DocumentRecord & { score?: number }> = [];
  total = 0;

  find(filter: unknown, options: FindCall["options"]) {
    this.calls.push({ filter, options });

    const projection = options.projection ?? {};
    const skip = options.skip ?? 0;
    const limit = options.limit ?? this.documents.length;
    const page = this.documents.slice(skip, skip + limit);

    const projected = page.map((document) => {
      const result: Record<string, unknown> = {};
      for (const [field, value] of Object.entries(projection)) {
        if (value === 1) result[field] = document[field as keyof typeof document];
      }
      if (projection.score !== undefined) {
        result.score = document.score;
      }
      return result;
    });

    return { toArray: async () => projected };
  }

  countDocuments(filter: unknown) {
    this.countCalls.push(filter);
    return Promise.resolve(this.total);
  }
}

function fakeDb(collection: FakeCollection): Db {
  return { collection: () => collection } as unknown as Db;
}

const document = (id: string, score?: number) =>
  ({
    _id: id,
    title: "Rethinking aggregation pipelines",
    description: "A guide to aggregation pipelines.",
    content: "Aggregation pipelines transform documents through stages.",
    category: "data",
    tags: ["mongodb"],
    author: "Amara Okafor",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...(score !== undefined ? { score } : {}),
  }) as DocumentRecord & { score?: number };

describe("createSearchRepository projection behaviour", () => {
  it("passes a score projection to MongoDB for relevance searches", async () => {
    const store = new FakeCollection();
    store.documents = [document("doc-0001", 1.5)];
    store.total = 1;

    const repository = createSearchRepository(fakeDb(store));
    await repository.search(query());

    const projection = store.calls[0]?.options.projection as Record<string, unknown>;
    expect(projection.score).toEqual({ $meta: "textScore" });
    // The default fields must survive alongside the score projection.
    expect(projection.title).toBe(1);
    expect(projection.createdAt).toBe(1);
  });

  it("returns the score from the database result, not a mock-supplied one", async () => {
    const store = new FakeCollection();
    store.documents = [document("doc-0001", 2.75)];
    store.total = 1;

    const repository = createSearchRepository(fakeDb(store));
    const page = await repository.search(query());

    expect(page.hits[0]?.score).toBe(2.75);
    expect(store.calls[0]?.options.projection).toBeDefined();
  });

  it("omits score when the database returns no score field", async () => {
    const store = new FakeCollection();
    store.documents = [document("doc-0001")];
    store.total = 1;

    const repository = createSearchRepository(fakeDb(store));
    const page = await repository.search(query({ q: "", sort: "created" }));

    expect(page.hits[0]?.score).toBeUndefined();
    expect(page.hits[0]?.document._id).toBe("doc-0001");
  });

  it("strips score out of the document payload", async () => {
    const store = new FakeCollection();
    store.documents = [document("doc-0001", 1.25)];
    store.total = 1;

    const repository = createSearchRepository(fakeDb(store));
    const page = await repository.search(query());

    expect(page.hits[0]?.document).not.toHaveProperty("score");
  });

  it("merges a caller-supplied projection with the score projection", async () => {
    const store = new FakeCollection();
    store.documents = [document("doc-0001", 1.0)];
    store.total = 1;

    const repository = createSearchRepository(fakeDb(store), {
      project: { _id: 1, title: 1 },
    });
    await repository.search(query());

    const projection = store.calls[0]?.options.projection as Record<string, unknown>;
    expect(projection).toEqual({
      _id: 1,
      title: 1,
      score: { $meta: "textScore" },
    });
  });

  it("uses $all for tag filters in the real repository path", async () => {
    const store = new FakeCollection();
    store.documents = [];
    store.total = 0;

    const repository = createSearchRepository(fakeDb(store));
    await repository.search(query({ q: "", sort: "created", tags: ["mongodb", "pipelines"] }));

    expect(store.calls[0]?.filter).toEqual({ tags: { $all: ["mongodb", "pipelines"] } });
  });

  it("counts with the same filter used for the page fetch", async () => {
    const store = new FakeCollection();
    store.documents = [];
    store.total = 0;

    const repository = createSearchRepository(fakeDb(store));
    await repository.search(query({ category: "data" }));

    expect(store.countCalls[0]).toEqual(store.calls[0]?.filter);
  });
});