import { generateDocuments } from "./seed-data.js";
import { validateDocument } from "../models/document.js";

export interface SeedSummary {
  generated: number;
  upserted: number;
  matched: number;
}

/**
 * Generates the sample dataset and upserts it into the `documents` collection.
 *
 * Safe to run repeatedly: documents are keyed by a deterministic `_id` and
 * written with `replaceOne`-style upserts, so reruns converge on the same
 * state. No document is ever deleted.
 */
export async function runSeed(
  seed: (documents: ReturnType<typeof generateDocuments>) => Promise<{
    upserted: number;
    matched: number;
  }>
): Promise<SeedSummary> {
  const documents = generateDocuments();

  const invalid = documents
    .map((document) => ({ document, result: validateDocument(document) }))
    .filter((entry) => !entry.result.valid);

  if (invalid.length > 0) {
    const details = invalid
      .slice(0, 5)
      .map((entry) => `${entry.document._id}: ${entry.result.errors.join("; ")}`)
      .join("\n");
    throw new Error(`Refusing to seed ${invalid.length} invalid document(s):\n${details}`);
  }

  const { upserted, matched } = await seed(documents);

  return { generated: documents.length, upserted, matched };
}