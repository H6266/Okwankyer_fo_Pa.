import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 10000,
    hookTimeout: 10000,
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
});
