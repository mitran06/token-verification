import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

const stub = fileURLToPath(new URL("./tests/stubs/empty.ts", import.meta.url));

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    // `server-only` throws when imported outside a bundler; stub it for Node tests.
    alias: { "server-only": stub },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    testTimeout: 120_000,
  },
});
