import { withDatabase } from "./cli.js";
import { createDocumentsRepository } from "./documents.js";

async function main() {
  await withDatabase(async (db) => {
    const repository = createDocumentsRepository(db);
    const indexes = await repository.createIndexes();
    console.log(`[smartsearch] ensured ${indexes.length} index(es): ${indexes.join(", ")}`);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[smartsearch] index creation failed: ${message}`);
  process.exitCode = 1;
});