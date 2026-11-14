import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), ".env") });

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

export function parseCorsOrigins(
  value: string | undefined,
  nodeEnv: string = process.env.NODE_ENV ?? "development"
): string[] {
  const configured = (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (configured.length === 0) {
    if (nodeEnv === "production") {
      throw new Error(
        "CORS_ORIGIN is required in production. Set one or more allowed frontend origins, comma-separated."
      );
    }

    return ["http://localhost:5173", "http://127.0.0.1:5173"];
  }

  if (configured.includes("*")) {
    if (nodeEnv === "production") {
      throw new Error(
        "Wildcard CORS_ORIGIN is not allowed in production. Use an explicit origin or comma-separated allowlist."
      );
    }
    return configured;
  }

  const invalid = configured.filter((origin) => {
    try {
      const parsed = new URL(origin);
      return parsed.protocol !== "http:" && parsed.protocol !== "https:";
    } catch {
      return true;
    }
  });

  if (invalid.length > 0) {
    throw new Error(
      `Invalid CORS_ORIGIN value(s): ${invalid.join(", ")}. Use explicit http(s) origins.`
    );
  }

  return configured;
}

/**
 * Extracts the database name from a MongoDB connection string.
 *
 * Handles both `mongodb://host/db` and `mongodb+srv://user:pass@host/db?opts`
 * forms, including multi-host URIs. Returns undefined when no database is set.
 */
export function databaseNameFromUri(uri: string | undefined): string | undefined {
  if (!uri) {
    return undefined;
  }

  const withoutQuery = uri.split("?")[0] ?? uri;
  const schemeIndex = withoutQuery.indexOf("://");
  if (schemeIndex === -1) {
    return undefined;
  }

  const afterScheme = withoutQuery.slice(schemeIndex + 3);
  const slashIndex = afterScheme.indexOf("/");
  if (slashIndex === -1) {
    return undefined;
  }

  const database = afterScheme.slice(slashIndex + 1).trim();
  return database === "" ? undefined : database;
}

export interface Env {
  port: number;
  nodeEnv: string;
  mongoUri?: string;
  mongoDb?: string;
  corsOrigin: string[];
}

export function loadEnvVars(): Env {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const mongoUri = optional("MONGODB_URI");
  // MONGODB_DB wins when set; otherwise fall back to the database in the URI.
  const mongoDb = optional("MONGODB_DB") ?? databaseNameFromUri(mongoUri);

  return {
    port: Number(process.env.PORT ?? 4000),
    nodeEnv,
    // MongoDB is optional during the scaffold stage. When unset the server
    // still starts, but /api/ready reports the database as unavailable.
    mongoUri,
    mongoDb,
    corsOrigin: parseCorsOrigins(optional("CORS_ORIGIN"), nodeEnv),
  };
}