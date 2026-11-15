import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "../docs/openapi.js";

export function createDocsRouter() {
  const router = Router();

  router.get("/openapi.json", (_req, res) => {
    res.json(openApiSpec);
  });

  router.use(
    "/",
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, {
      customSiteTitle: "SmartSearch API Documentation",
      swaggerOptions: {
        url: "/api/openapi.json",
        deepLinking: true,
        displayRequestDuration: true,
        docExpansion: "list",
      },
    }),
  );

  return router;
}
