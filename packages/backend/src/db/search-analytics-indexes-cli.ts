import { withDatabase } from "./cli.js";
import { createSearchAnalyticsIndexes } from "../search/analytics-repository.js";

async function main() {
  await withDatabase(async (db) => {
    const indexes = await createSearchAnalyticsIndexes(db);
    console.log(
      `[smartsearch] analytics indexes created and verified: ${indexes.join(", ")}`
    );
  });
}

main().catch((error: unknown) => {
  const errorType = error instanceof Error ? error.name : typeof error;
  console.error(
    `[smartsearch] analytics index management failed (${errorType})`
  );
  process.exitCode = 1;
});
