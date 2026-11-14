import type { Collection, Db, IndexSpecification } from "mongodb";
import type { DocumentRecord } from "../models/document.js";

export const DOCUMENTS_COLLECTION = "documents";

/**
 * Indexes supporting the search query patterns. Every index is declared here
 * (never created implicitly) so the schema is explicit and reviewable.
 *
 * Sort specifications in `search/repository.ts` mirror these key patterns
 * exactly; if either side changes, the other must change with it.
 */
export const DOCUMENT_INDEXES: ReadonlyArray<{
  name: string;
  keys: IndexSpecification;
  rationale: string;
}> = [
  {
    name: "category_createdAt",
    keys: { category: 1, createdAt: -1 },
    rationale:
      "Equality on category plus newest-first sort; the most common filter+sort pair.",
  },
  {
    name: "tags_createdAt",
    keys: { tags: 1, createdAt: -1 },
    rationale:
      "Multikey index for tag filtering combined with newest-first ordering.",
  },
  {
    name: "createdAt_desc",
    keys: { createdAt: -1 },
    rationale: "Default newest-first ordering when no filter is applied.",
  },
  {
    name: "category_tags",
    keys: { category: 1, tags: 1 },
    rationale:
      "Compound coverage for category + tag filters when ordering is not required.",
  },
  {
    name: "title_text",
    keys: { title: "text", description: "text", content: "text" },
    rationale:
      "Text index providing keyword search before Atlas Search is provisioned.",
  },
  {
    name: "updatedAt_desc",
    keys: { updatedAt: -1 },
    rationale: "Supports sorting by most recently updated documents.",
  },
  {
    name: "createdAt_desc_id",
    keys: { createdAt: -1, _id: -1 },
    rationale:
      "Matches the `created` sort exactly, including the _id tie-breaker, so results stream in index order without an in-memory SORT stage.",
  },
  {
    name: "updatedAt_desc_id",
    keys: { updatedAt: -1, _id: -1 },
    rationale:
      "Matches the `updated` sort exactly, including the _id tie-breaker, so results stream in index order without an in-memory SORT stage.",
  },
  {
    name: "category_createdAt_id",
    keys: { category: 1, createdAt: -1, _id: -1 },
    rationale:
      "Equality on category plus the full `created` sort key (including _id), so filtered newest-first queries stream in index order instead of buffering the whole category.",
  },
  {
    name: "tags_createdAt_id",
    keys: { tags: 1, createdAt: -1, _id: -1 },
    rationale:
      "Multikey tag equality plus the full `created` sort key, so filtered tag queries stream in index order without an in-memory SORT stage.",
  },
];

export interface DocumentsRepositoryOptions {
  logger?: { info(message: string): void; warn(message: string): void };
}

export interface DocumentsRepository {
  collection(): Collection<DocumentRecord>;
  createIndexes(): Promise<string[]>;
  seed(documents: DocumentRecord[]): Promise<{ upserted: number; matched: number }>;
}

/**
 * Returns a repository bound to the `documents` collection.
 *
 * Seeding is an idempotent upsert keyed on the deterministic `_id`, so running
 * it repeatedly converges on the same state without creating duplicates and
 * without deleting anything.
 */
export function createDocumentsRepository(
  db: Db,
  options: DocumentsRepositoryOptions = {}
): DocumentsRepository {
  const logger = options.logger ?? console;

  const collection = (): Collection<DocumentRecord> =>
    db.collection<DocumentRecord>(DOCUMENTS_COLLECTION);

  const createIndexes = async (): Promise<string[]> => {
    const created: string[] = [];
    for (const index of DOCUMENT_INDEXES) {
      const name = await collection().createIndex(index.keys, {
        name: index.name,
        background: true,
      });
      created.push(name);
    }
    logger.info(`[smartsearch] ensured ${created.length} index(es) on ${DOCUMENTS_COLLECTION}`);
    return created;
  };

  const seed = async (
    documents: DocumentRecord[]
  ): Promise<{ upserted: number; matched: number }> => {
    if (documents.length === 0) {
      return { upserted: 0, matched: 0 };
    }

    const operations = documents.map((document) => ({
      updateOne: {
        filter: { _id: document._id },
        update: { $set: document },
        upsert: true,
      },
    }));

    const result = await collection().bulkWrite(operations, { ordered: false });

    return {
      upserted: result.upsertedCount,
      matched: result.matchedCount,
    };
  };

  return { collection, createIndexes, seed };
}