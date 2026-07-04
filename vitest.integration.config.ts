import { defineConfig } from "vitest/config";
import { resolve } from "path";

// Integration tests hit real local Anki containers (see docs/local-anki-containers.md).
// Kept out of `npm test` — run with `npm run test:integration`. Tests self-skip
// when the containers are unreachable.
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globals: false,
    reporters: "default",
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
