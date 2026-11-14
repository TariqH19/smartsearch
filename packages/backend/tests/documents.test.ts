import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import {
  DOCUMENT_INDEXES,
  DOCUMENTS_COLLECTION,
  createDocumentsRepository,
} from "../src/db/documents.js";
import { generateDocuments } from "../src/db/seed-data.js";
import type { DocumentRecord } from "../src/models/document.js";

interface CappedWrite {
  updateOne: {
    filter: { _id: string };
    update: { $set: DocumentRecord };
    upsert: boolean;
  };
}

class FakeCollection {
  readonly documents = new Map<string, DocumentRecord>();
  readonly indexes: Array<{ keys: unknown; options: unknown }> = [];
  readonly writes: CappedWrite[] = [];

  async createIndex(keys: unknown, options: unknown): Promise<string> {
    this.indexes.push({ keys, options });
    return (options as { name: string }).name;
  }

  async bulkWrite(
    operations: CappedWrite[],
    _options?: unknown
  ): Promise<{ upsertedCount: number; matchedCount: number }> {
    let upsertedCount = 0;
    let matchedCount = 0;

    for (const operation of operations) {
      this.writes.push(operation);
      const { filter, update, upsert } = operation.updateOne;
      if (this.documents.has(filter._id)) {
        matchedCount += 1;
      } else if (upsert) {
        upsertedCount += 1;
      }
      this.documents.set(filter._id, update.$set);
    }

    return { upsertedCount, matchedCount };
  }
}

function fakeDb(collection: FakeCollection): Db {
  return {
    collection: () => collection,
  } as unknown as Db;
}

describe("createDocumentsRepository", () => {
  it("targets the documents collection", () => {
    const store = new FakeCollection();
    const repository = createDocumentsRepository(fakeDb(store));

    expect(repository.collection()).toBe(store as never);
    expect(DOCUMENTS_COLLECTION).toBe("documents");
  });

  it("creates every declared index exactly once", async () => {
    const store = new FakeCollection();
    const repository = createDocumentsRepository(fakeDb(store));

    const created = await repository.createIndexes();

    expect(created).toHaveLength(DOCUMENT_INDEXES.length);
    expect(store.indexes).toHaveLength(DOCUMENT_INDEXES.length);
    expect(created).toEqual(DOCUMENT_INDEXES.map((index) => index.name));
  });

  it("seeds documents and reports upserts", async () => {
    const store = new FakeCollection();
    const repository = createDocumentsRepository(fakeDb(store));
    const documents = generateDocuments({ count: 25 });

    const result = await repository.seed(documents);

    expect(result.upserted).toBe(25);
    expect(result.matched).toBe(0);
    expect(store.documents.size).toBe(25);
  });

  it("is idempotent: a rerun updates rather than duplicates", async () => {
    const store = new FakeCollection();
    const repository = createDocumentsRepository(fakeDb(store));
    const documents = generateDocuments({ count: 40 });

    await repository.seed(documents);
    const second = await repository.seed(documents);

    expect(second.upserted).toBe(0);
    expect(second.matched).toBe(40);
    expect(store.documents.size).toBe(40);
  });

  it("uses deterministic _id filters for every write", async () => {
    const store = new FakeCollection();
    const repository = createDocumentsRepository(fakeDb(store));
    const documents = generateDocuments({ count: 5 });

    await repository.seed(documents);

    expect(store.writes).toHaveLength(5);
    for (const write of store.writes) {
      expect(write.updateOne.upsert).toBe(true);
      expect(write.updateOne.filter._id).toBe(write.updateOne.update.$set._id);
    }
  });

  it("does nothing for an empty batch", async () => {
    const store = new FakeCollection();
    const repository = createDocumentsRepository(fakeDb(store));

    await expect(repository.seed([])).resolves.toEqual({ upserted: 0, matched: 0 });
    expect(store.writes).toHaveLength(0);
  });
});