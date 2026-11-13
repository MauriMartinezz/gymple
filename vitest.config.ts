import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

// Unit tests: fast, no database. Integration tests run with
// `pnpm test:integration` (see vitest.integration.config.ts).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts"],
  },
});
