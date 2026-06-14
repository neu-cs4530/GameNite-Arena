import "dotenv/config";
import { beforeEach } from "vitest";
import { resetEverythingToDefaults } from "../src/initRepository.ts";
import { MatchRepo, WatchCountRepo } from "../src/repository.ts";
import { setLeaderboardCacheNamespaceForTests } from "../src/services/leaderboard.service.ts";
import { matchRecorder } from "../src/services/matchRecorder.service.ts";
import { makeDefaultStore, replaceStoreForTests } from "../src/services/replay.service.ts";

// Spec workers share ONE real Redis but keep per-worker in-memory repos, so
// concurrent files touching the same leaderboard cache keys race each other
// (e.g. one worker's rated game invalidating another worker's cached board
// mid-assertion). Namespacing by pid makes the cache worker-local.
setLeaderboardCacheNamespaceForTests(`vitest:${process.pid}:`);

beforeEach(async () => {
  await resetEverythingToDefaults();
  // resetEverythingToDefaults only reseeds the starter-code repos. Clear the
  // match archive and the recorder/replay singletons here so captured matches
  // and watch counts can't bleed between tests in the same file. (The clear
  // lives here rather than in resetEverythingToDefaults because server.ts
  // runs that function against real deployments.)
  await MatchRepo.clear();
  await WatchCountRepo.clear();
  matchRecorder.resetForTests();
  replaceStoreForTests(makeDefaultStore());
});
