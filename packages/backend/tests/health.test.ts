import { describe, expect, it } from "vitest";
import supertest from "supertest";
import { createApp } from "../src/app.js";
import { createHealthRouter } from "../src/routes/health.js";
import {
  createMongoConnection,
  type MongoConnection,
  type MongoState,
  type MongoStatus,
} from "../src/config/mongo.js";

const request = supertest;

function stubMongo(state: MongoState, configured = true): MongoConnection {
  return {
    isConfigured: () => configured,
    isConnected: () => state === "connected",
    getState: () => state,
    getClient: () => null,
    connect: async () => state,
    disconnect: async () => undefined,
    ping: async () => state === "connected",
    status: async (): Promise<MongoStatus> => ({ state, configured }),
  };
}

function appWithMongo(mongo: MongoConnection) {
  return createApp({ healthRouter: createHealthRouter({ mongo }) });
}

describe("GET /api/health (liveness)", () => {
  it("returns 200 with status ok and never touches MongoDB", async () => {
    const res = await request(createApp()).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.uptime).toBe("number");
    expect(typeof res.body.timestamp).toBe("string");
    expect(res.body.mongo).toBeUndefined();
  });
});

describe("GET /api/ready (readiness)", () => {
  it("returns 200 when MongoDB is connected", async () => {
    const res = await request(appWithMongo(stubMongo("connected"))).get("/api/ready");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
    expect(res.body.mongo.state).toBe("connected");
    expect(res.body.mongo.configured).toBe(true);
  });

  it("returns 503 when MongoDB is disconnected", async () => {
    const res = await request(appWithMongo(stubMongo("disconnected"))).get("/api/ready");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("not_ready");
    expect(res.body.mongo.state).toBe("disconnected");
    expect(res.body.mongo.configured).toBe(true);
  });

  it("returns 503 when MongoDB is unconfigured", async () => {
    const res = await request(
      appWithMongo(stubMongo("unconfigured", false))
    ).get("/api/ready");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("not_ready");
    expect(res.body.mongo.state).toBe("unconfigured");
    expect(res.body.mongo.configured).toBe(false);
  });

  it("returns 503 when no connection is injected", async () => {
    const res = await request(createApp()).get("/api/ready");

    expect(res.status).toBe(503);
    expect(res.body.mongo.state).toBe("unconfigured");
  });

  it("returns JSON content-type, never HTML", async () => {
    const res = await request(appWithMongo(stubMongo("connected"))).get("/api/ready");
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("does not leak credentials in the response", async () => {
    const res = await request(appWithMongo(stubMongo("disconnected"))).get("/api/ready");
    expect(JSON.stringify(res.body)).not.toMatch(/mongodb(\+srv)?:\/\//);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });
});

describe("serverless MongoDB connection middleware", () => {
  it("reuses an established connection and leaves liveness independent", async () => {
    let connected = false;
    let connectCalls = 0;
    const mongo: MongoConnection = {
      isConfigured: () => true,
      isConnected: () => connected,
      getState: () => (connected ? "connected" : "disconnected"),
      getClient: () => null,
      connect: async () => {
        connectCalls += 1;
        connected = true;
        return "connected";
      },
      disconnect: async () => undefined,
      ping: async () => connected,
      status: async () => ({
        state: connected ? "connected" : "disconnected",
        configured: true,
      }),
    };
    const app = createApp({ mongo, connectMongoOnRequest: true });

    await request(app).get("/api/health").expect(200);
    expect(connectCalls).toBe(0);

    await request(app).get("/api/ready").expect(200);
    await request(app).get("/api/ready").expect(200);
    expect(connectCalls).toBe(1);
  });
});

describe("createMongoConnection", () => {
  it("reports unconfigured when credentials are absent", async () => {
    const mongo = createMongoConnection({});
    expect(mongo.isConfigured()).toBe(false);

    const state = await mongo.connect();
    expect(state).toBe("unconfigured");

    const status = await mongo.status();
    expect(status).toEqual({ state: "unconfigured", configured: false });
    expect(mongo.getClient()).toBeNull();
  });

  it("stays disconnected and does not throw on connection failure", async () => {
    const warnings: string[] = [];
    const mongo = createMongoConnection(
      { uri: "mongodb://user:secret@127.0.0.1:1/db", dbName: "test" },
      {
        serverSelectionTimeoutMS: 200,
        logger: {
          info: () => undefined,
          warn: (m) => warnings.push(m),
          error: () => undefined,
        },
      }
    );

    const state = await mongo.connect();

    expect(state).toBe("disconnected");
    expect(mongo.isConnected()).toBe(false);
    expect(mongo.getState()).toBe("disconnected");
    expect(mongo.getClient()).toBeNull();
  });

  it("redacts credentials from logged error messages", async () => {
    const warnings: string[] = [];
    const mongo = createMongoConnection(
      { uri: "mongodb://admin:hunter2@127.0.0.1:1/db", dbName: "test" },
      {
        serverSelectionTimeoutMS: 200,
        logger: {
          info: () => undefined,
          warn: (m) => warnings.push(m),
          error: () => undefined,
        },
      }
    );

    await mongo.connect();

    const output = warnings.join("\n");
    expect(output).not.toContain("hunter2");
    expect(output).not.toContain("admin:hunter2@");
  });

  it("disconnect is safe when never connected", async () => {
    const mongo = createMongoConnection({});
    await expect(mongo.disconnect()).resolves.toBeUndefined();
    expect(mongo.getState()).toBe("unconfigured");
  });

  it("status() reports disconnected when configured but never connected", async () => {
    const mongo = createMongoConnection({
      uri: "mongodb://127.0.0.1:1/db",
      dbName: "test",
    });

    const status = await mongo.status();
    expect(status).toEqual({ state: "disconnected", configured: true });
  });
});