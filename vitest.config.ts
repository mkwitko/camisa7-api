import { defineConfig } from "vitest/config";

// NOTE: the company skill's TESTING.md §2 splits this into vitest.config.ts +
// vitest.workspace.ts. Vitest 4 (installed here) deprecated `workspace` /
// `defineWorkspace` in favor of the inline `test.projects` array (same file) —
// see https://vitest.dev/guide/migration — so the unit/integration/e2e split
// lives here as `projects` instead of a separate workspace file.
//
// `resolve.tsconfigPaths` (native, replaces the `vite-tsconfig-paths` plugin
// per Vitest 4's own deprecation notice) is set per-project below because each
// entry in `test.projects` is its own isolated Vite config and does not
// inherit the root-level `resolve`/`plugins`.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: false,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/server.ts", "src/**/*.schema.ts"],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
    pool: "threads",
    projects: [
      {
        resolve: { tsconfigPaths: true },
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          setupFiles: ["test/setup-unit.ts"],
        },
      },
      {
        resolve: { tsconfigPaths: true },
        test: {
          name: "integration",
          include: ["test/integration/**/*.test.ts"],
          setupFiles: ["test/setup-integration.ts"],
        },
      },
      {
        resolve: { tsconfigPaths: true },
        test: {
          name: "e2e",
          include: ["test/e2e/**/*.test.ts"],
          setupFiles: ["test/setup-e2e.ts"],
        },
      },
    ],
  },
});
