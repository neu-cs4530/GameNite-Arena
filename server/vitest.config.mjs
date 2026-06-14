import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: "./tests/setup.ts",
    // Spec files share one real Redis (REDIS_URL) and several suites touch
    // the same literal keys (leaderboard:<game>:* is written by the
    // leaderboard spec and asserted/poisoned by the rating spec), so
    // parallel files race each other into intermittent failures. Run files
    // sequentially; the suite is small enough that this costs seconds.
    fileParallelism: false,
  },
});
