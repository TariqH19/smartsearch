import { createBackendRuntime } from "./runtime.js";

const { app, mongo, port } = createBackendRuntime();

async function main() {
  // Connect on boot only when credentials are configured. A failure here is
  // logged and tolerated so the API still serves /api/health and /api/ready.
  await mongo.connect();

  const server = app.listen(port, () => {
    console.log(`[smartsearch] API listening on http://localhost:${port}`);
    console.log(`[smartsearch] Health:    http://localhost:${port}/api/health`);
    console.log(`[smartsearch] Ready:     http://localhost:${port}/api/ready`);
    console.log(`[smartsearch] Search:    http://localhost:${port}/api/search`);
    console.log(`[smartsearch] Advanced:  http://localhost:${port}/api/search/advanced`);
    console.log(`[smartsearch] Analytics: http://localhost:${port}/api/analytics/overview`);
    console.log(`[smartsearch] Suggest:   http://localhost:${port}/api/search/suggest`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[smartsearch] ${signal} received, shutting down...`);
    server.close(async () => {
      await mongo.disconnect();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();