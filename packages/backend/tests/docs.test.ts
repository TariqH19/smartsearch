import { expect, it } from "vitest";
import supertest from "supertest";
import { createApp } from "../src/app.js";

const request = supertest;

it("serves the OpenAPI specification with the mounted API base path", async () => {
  const response = await request(createApp()).get("/api/openapi.json");

  expect(response.status).toBe(200);
  expect(response.body.openapi).toBe("3.0.3");
  expect(response.body.servers).toEqual([
    expect.objectContaining({ url: "/api" }),
  ]);
  expect(Object.keys(response.body.paths)).toEqual([
    "/health",
    "/ready",
    "/search",
    "/search/advanced",
    "/search/suggest",
    "/analytics/overview",
  ]);
  expect(response.body.components.schemas.DocumentSummary.properties).not.toHaveProperty(
    "content"
  );
});

it("serves Swagger UI configured to load the OpenAPI document", async () => {
  const app = createApp();
  const response = await request(app).get("/api/docs");

  expect(response.status).toBe(301);
  expect(response.headers.location).toBe("/api/docs/");

  const ui = await request(app).get("/api/docs/");
  expect(ui.status).toBe(200);
  expect(ui.text).toContain("SmartSearch API Documentation");
  const initialization = await request(app).get(
    "/api/docs/swagger-ui-init.js"
  );
  expect(initialization.status).toBe(200);
  expect(initialization.text).toContain("/api/openapi.json");

  const bundle = await request(app).get(
    "/api/docs/swagger-ui-bundle.js"
  );
  expect(bundle.status).toBe(200);
  expect(bundle.headers["content-type"]).toMatch(/javascript/);
});
