/// <reference types="vite/client" />

/**
 * Frontend environment contract.
 *
 * Only non-secret, frontend-safe configuration is declared here. Anything
 * prefixed with `VITE_` is bundled into the client; never put MongoDB
 * credentials, connection strings, or backend secrets behind this prefix.
 */

interface ImportMetaEnv {
  /** Backend API base URL. Optional: the dev server proxies `/api`. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}