import { withDatabase } from "../db/cli.js";
import { createDocumentsRepository } from "../db/documents.js";
import { runSeed } from "../db/seed.js";

async function main() {
  await withDatabase(async (db) => {
    const repository = createDocumentsRepository(db);

    console.log("[smartsearch] ensuring indexes...");
    const indexes = await repository.createIndexes();
    console.log(`[smartsearch] indexes ready: ${indexes.join(", ")}`);

    console.log("[smartsearch] seeding documents...");
    const summary = await runSeed((documents) => repository.seed(documents));

    console.log(
      `[smartsearch] seed complete: generated=${summary.generated} upserted=${summary.upserted} matched=${summary.matched}`
    );
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[smartsearch] seed failed: ${message}`);
  process.exitCode = 1;
});