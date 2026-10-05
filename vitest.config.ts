import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts", "tests/{corpus,integration}/**/*.test.ts"],
    environment: "node",
  },
});
