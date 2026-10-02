import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "docs/templates/**/*.test.ts"],
    environment: "node",
  },
});
