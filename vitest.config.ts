import { defineConfig } from "vitest/config";
import tsconfigPaths from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": tsconfigPaths.resolve(__dirname, "./src"),
    },
  },
});
