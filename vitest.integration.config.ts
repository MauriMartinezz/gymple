import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

// Integration tests against a real, disposable MySQL database.
// They share one database, so files run one at a time.
export default mergeConfig(
  { ...base, test: {} },
  defineConfig({
    test: {
      include: ["**/*.integration.test.ts"],
      exclude: ["**/node_modules/**", "**/.next/**"],
      fileParallelism: false,
      env: {
        TEST_DATABASE_URL:
          process.env.TEST_DATABASE_URL ?? "mysql://gymple:gymple@localhost:3307/gymple_test",
      },
    },
  }),
);
