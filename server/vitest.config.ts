import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    testTimeout: 20000,
    hookTimeout: 20000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/trade_order_test",
      JWT_SECRET: "test-secret",
      COMPLIANCE_APPROVAL_THRESHOLD: "100000",
    },
    fileParallelism: false,
  },
});
