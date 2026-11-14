import type { Db } from "mongodb";
import { loadEnvVars } from "../config/env.js";
import { createMongoConnection } from "../config/mongo.js";

/** Databases this project is allowed to read from and write to. */
export const ALLOWED_DATABASES = ["smartsearch"] as const;

function assertAllowedDatabase(database: string): void {
  if (!(ALLOWED_DATABASES as readonly string[]).includes(database)) {
    throw new Error(
      `Refusing to run: resolved database "${database}" is not in the allowed list (${ALLOWED_DATABASES.join(", ")}).`
    );
  }
}

/**
 * Connects using the backend environment, runs `fn` against the database, and
 * always closes the connection afterwards.
 *
 * Credentials are read from the environment only; they are never logged.
 * Refuses to operate on any database other than the approved target.
 */
export async function withDatabase<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const env = loadEnvVars();

  if (!env.mongoDb) {
    throw new Error(
      "No database resolved. Set MONGODB_DB in packages/backend/.env or include a database in MONGODB_URI."
    );
  }
  assertAllowedDatabase(env.mongoDb);

  const mongo = createMongoConnection({
    uri: env.mongoUri,
    dbName: env.mongoDb,
  });

  const state = await mongo.connect();
  if (state !== "connected") {
    throw new Error(
      `MongoDB is unavailable (state: ${state}). Check MONGODB_URI in packages/backend/.env.`
    );
  }

  const client = mongo.getClient();
  if (!client) {
    throw new Error("MongoDB client was not initialised.");
  }

  console.log(`[smartsearch] target database: ${env.mongoDb}`);

  try {
    return await fn(client.db(env.mongoDb));
  } finally {
    await mongo.disconnect();
  }
}