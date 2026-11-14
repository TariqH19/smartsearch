import { expect, it } from "vitest";
import supertest from "supertest";
import handler from "../src/vercel.js";

it("serves the Express API through its serverless app", async () => {
  const response = await supertest(handler).get("/api/health");

  expect(response.status).toBe(200);
  expect(response.body.status).toBe("ok");
  expect(response.headers["x-content-type-options"]).toBe("nosniff");
});
