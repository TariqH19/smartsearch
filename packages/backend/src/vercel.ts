import { createBackendRuntime } from "./runtime.js";

const { app } = createBackendRuntime({ connectMongoOnRequest: true });

export default app;
