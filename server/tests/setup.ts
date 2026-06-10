import { beforeEach } from "vitest";
import { resetEverythingToDefaults } from "../src/initRepository.ts";
import { MatchRepo, WatchCountRepo } from "../src/repository.ts";
import { matchRecorder } from "../src/services/matchRecorder.service.ts";
import { makeDefaultStore, replaceStoreForTests } from "../src/services/replay.service.ts";

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
