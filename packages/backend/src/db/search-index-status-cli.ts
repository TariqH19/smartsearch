import { withDatabase } from "./cli.js";
import {
  ATLAS_SEARCH_INDEX_NAME,
  DOCUMENTS_AUTOCOMPLETE_INDEX,
} from "../search/atlas-index.js";

/**
 * Read-only report on Atlas Search index status.
 *
 * Atlas Search indexes are created and managed in the Atlas UI (or the Atlas
 * Administration API). This script verifies whether they exist and are ready;
 * it never creates them, so it cannot report a success that has not happened.
 */
async function main() {
  await withDatabase(async (db) => {
    const collection = db.collection("documents");

    const indexes = await collection.listSearchIndexes().toArray();

    console.log("\n=== Atlas Search index status ===");
    console.log(`collection: documents (db: ${db.databaseName})`);
    console.log(`declared names: ${ATLAS_SEARCH_INDEX_NAME}, ${DOCUMENTS_AUTOCOMPLETE_INDEX.name}`);

    if (indexes.length === 0) {
      console.log("\nNo Atlas Search indexes found.");
      console.log(
        "Create them in Atlas (Search > Create Search Index) or via the Atlas Admin API."
      );
      process.exitCode = 2;
      return;
    }

    for (const index of indexes) {
      const status = (index as { status?: string }).status ?? "UNKNOWN";
      const name = (index as { name?: string }).name ?? "(unnamed)";
      const queryable = (index as { queryable?: boolean }).queryable;
      console.log(`- ${name}: status=${status} queryable=${queryable ?? "unknown"}`);
    }

    const queryable = indexes.some(
      (index) =>
        (index as { name?: string }).name === ATLAS_SEARCH_INDEX_NAME &&
        (index as { queryable?: boolean }).queryable === true
    );

    if (!queryable) {
      console.log(
        `\n"${ATLAS_SEARCH_INDEX_NAME}" is not queryable yet. Atlas Search indexes can take ` +
          "several minutes to build after creation."
      );
      process.exitCode = 3;
    } else {
      console.log(`\n"${ATLAS_SEARCH_INDEX_NAME}" is queryable.`);
    }
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[smartsearch] atlas search status check failed: ${message}`);
  process.exitCode = 1;
});