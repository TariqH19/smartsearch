import { MongoClient } from "mongodb";

export type MongoState = "connected" | "disconnected" | "unconfigured";

export interface MongoConfig {
  uri?: string;
  dbName?: string;
}

export interface MongoStatus {
  state: MongoState;
  configured: boolean;
}

export interface MongoLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface MongoConnection {
  isConfigured(): boolean;
  isConnected(): boolean;
  getState(): MongoState;
  getClient(): MongoClient | null;
  connect(): Promise<MongoState>;
  disconnect(): Promise<void>;
  ping(): Promise<boolean>;
  status(): Promise<MongoStatus>;
}

export interface MongoConnectionOptions {
  serverSelectionTimeoutMS?: number;
  logger?: MongoLogger;
}

const CREDENTIALS_PATTERN = /mongodb(?:\+srv)?:\/\/[^\s/@]+:[^\s/@]+@/gi;

/**
 * Strips user:password from anything that looks like a connection string.
 * Used before any error message is written to logs.
 */
export function redactSecrets(value: string): string {
  return value.replace(CREDENTIALS_PATTERN, "mongodb://***:***@");
}

const defaultLogger: MongoLogger = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(message),
  error: (message) => console.error(message),
};

/**
 * Creates a reusable MongoDB connection holder.
 *
 * The connection is owned by the caller (normally `server.ts`) and injected
 * into the HTTP layer, so there is no shared mutable module state.
 * `connect()` never throws: failures leave the instance in the
 * "disconnected" state so the API can still boot and report readiness.
 */
export function createMongoConnection(
  config: MongoConfig,
  options: MongoConnectionOptions = {}
): MongoConnection {
  const logger = options.logger ?? defaultLogger;
  const serverSelectionTimeoutMS = options.serverSelectionTimeoutMS ?? 5000;

  let client: MongoClient | null = null;
  let state: MongoState = "disconnected";
  let connecting: Promise<MongoState> | null = null;

  const isConfigured = (): boolean => Boolean(config.uri && config.dbName);
  const isConnected = (): boolean => state === "connected" && client !== null;
  const getState = (): MongoState => state;
  const getClient = (): MongoClient | null => client;

  const connect = async (): Promise<MongoState> => {
    if (!isConfigured()) {
      state = "unconfigured";
      logger.warn(
        "[smartsearch] MongoDB not configured (MONGODB_URI/MONGODB_DB unset). Starting without a database connection."
      );
      return state;
    }

    if (isConnected()) {
      return state;
    }

    // Collapse concurrent connect attempts into a single operation.
    if (connecting) {
      return connecting;
    }

    connecting = (async (): Promise<MongoState> => {
      let pending: MongoClient | null = null;
      try {
        pending = new MongoClient(config.uri as string, { serverSelectionTimeoutMS });
        await pending.connect();
        await pending.db(config.dbName).command({ ping: 1 });
        client = pending;
        state = "connected";
        logger.info(`[smartsearch] MongoDB connected (db: ${config.dbName})`);
        return state;
      } catch (err) {
        state = "disconnected";
        client = null;
        if (pending) {
          await pending.close().catch(() => undefined);
        }
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(`[smartsearch] MongoDB connection failed: ${redactSecrets(message)}`);
        return state;
      } finally {
        connecting = null;
      }
    })();

    return connecting;
  };

  const ping = async (): Promise<boolean> => {
    if (!client || !config.dbName) {
      return false;
    }
    try {
      await client.db(config.dbName).command({ ping: 1 });
      return true;
    } catch {
      return false;
    }
  };

  const status = async (): Promise<MongoStatus> => {
    if (!isConfigured()) {
      state = "unconfigured";
      return { state, configured: false };
    }

    if (state === "connected") {
      const reachable = await ping();
      if (!reachable) {
        state = "disconnected";
      }
    }

    return { state, configured: true };
  };

  const disconnect = async (): Promise<void> => {
    if (client) {
      await client.close().catch(() => undefined);
    }
    client = null;
    state = isConfigured() ? "disconnected" : "unconfigured";
    logger.info("[smartsearch] MongoDB connection closed");
  };

  return {
    isConfigured,
    isConnected,
    getState,
    getClient,
    connect,
    disconnect,
    ping,
    status,
  };
}