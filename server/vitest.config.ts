import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    testTimeout: 20000,
    hookTimeout: 20000,
    env: {
      DATABASE_URL: "file:./test.db",
      JWT_SECRET: "test-secret",
      COMPLIANCE_APPROVAL_THRESHOLD: "100000",
    },
    fileParallelism: false,
  },
});
