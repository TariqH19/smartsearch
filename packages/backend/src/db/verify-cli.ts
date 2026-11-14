import { withDatabase } from "./cli.js";
import { DOCUMENT_INDEXES, createDocumentsRepository } from "./documents.js";
import { DOCUMENT_CATEGORIES } from "../models/document.js";

interface VerificationReport {
  database: string;
  collection: string;
  totalDocuments: number;
  indexes: string[];
  missingIndexes: string[];
  categories: Record<string, number>;
  missingCategories: string[];
  invalidDocuments: number;
  fieldsPresent: boolean;
}

async function verify(): Promise<VerificationReport> {
  return withDatabase(async (db) => {
    const repository = createDocumentsRepository(db);
    const collection = repository.collection();

    const [totalDocuments, indexList, categoryRows, sample] = await Promise.all([
      collection.countDocuments(),
      collection.indexes(),
      collection.aggregate<{ _id: string; count: number }>([
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]).toArray(),
      collection.findOne({}),
    ]);

    const indexNames = indexList
      .map((index) => index.name)
      .filter((name): name is string => typeof name === "string");
    const expectedIndexNames = DOCUMENT_INDEXES.map((index) => index.name);

    const categories: Record<string, number> = {};
    for (const row of categoryRows) {
      categories[row._id] = row.count;
    }

    const requiredFields = [
      "title",
      "description",
      "content",
      "category",
      "tags",
      "author",
      "createdAt",
      "updatedAt",
    ] as const;

    const fieldsPresent = sample !== null && requiredFields.every((field) => field in sample);

    // Count documents missing any required field across the whole collection.
    const invalidDocuments = await collection.countDocuments({
      $or: requiredFields.map((field) => ({ [field]: { $exists: false } })),
    });

    return {
      database: db.databaseName,
      collection: "documents",
      totalDocuments,
      indexes: indexNames.sort(),
      missingIndexes: expectedIndexNames.filter((name) => !indexNames.includes(name)),
      categories,
      missingCategories: DOCUMENT_CATEGORIES.filter(
        (category) => categories[category] === undefined
      ),
      invalidDocuments,
      fieldsPresent,
    };
  });
}

async function main() {
  const report = await verify();

  console.log("\n=== SmartSearch data verification ===");
  console.log(`database:           ${report.database}`);
  console.log(`collection:         ${report.collection}`);
  console.log(`total documents:    ${report.totalDocuments}`);
  console.log(`indexes (${report.indexes.length}):`);
  for (const index of report.indexes) {
    console.log(`  - ${index}`);
  }
  console.log(`missing indexes:    ${report.missingIndexes.join(", ") || "none"}`);
  console.log("categories:");
  for (const [category, count] of Object.entries(report.categories)) {
    console.log(`  - ${category}: ${count}`);
  }
  console.log(`missing categories: ${report.missingCategories.join(", ") || "none"}`);
  console.log(`all fields present: ${report.fieldsPresent}`);
  console.log(`invalid documents:  ${report.invalidDocuments}`);
  console.log("====================================\n");

  const ok =
    report.database === "smartsearch" &&
    report.missingIndexes.length === 0 &&
    report.missingCategories.length === 0 &&
    report.fieldsPresent &&
    report.invalidDocuments === 0 &&
    report.totalDocuments > 0;

  if (!ok) {
    throw new Error("Verification failed - see report above.");
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[smartsearch] verification failed: ${message}`);
  process.exitCode = 1;
});