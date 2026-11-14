import { expect, it } from "vitest";
import supertest from "supertest";
import handler from "../../../api/[...path].ts";

it("serves the Express API through the Vercel function handler", async () => {
  const response = await supertest(handler).get("/api/health");

  expect(response.status).toBe(200);
  expect(response.body.status).toBe("ok");
  expect(response.headers["x-content-type-options"]).toBe("nosniff");
});
