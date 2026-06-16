import { defineConfig, coverageConfigDefaults } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: "./tests/setup.ts",
    // Spec files share one real Redis (REDIS_URL) and several suites touch
    // the same literal keys (leaderboard:<game>:* is written by the
    // leaderboard spec and asserted/poisoned by the rating spec), so
    // parallel files race each other into intermittent failures. Run files
    // sequentially; the suite is small enough that this costs seconds.
    fileParallelism: false,
    coverage: {
      exclude: [
        ...coverageConfigDefaults.exclude,
        // Application bootstrap: route mounting + socket-event registration +
        // request/socket logging. There is no business logic to unit-test
        // here — the wiring is exercised end-to-end by the Playwright suite,
        // so holding it to the unit branch-coverage bar only invites fake
        // "import the app and poke every route" tests. Excluded by design.
        "src/app.ts",
        // Process entrypoints / one-shot CLIs: a `listen()` call and a
        // migration runner driver, likewise not meaningful unit targets.
        "src/server.ts",
        "src/migrate.ts",
      ],
    },
  },
});
