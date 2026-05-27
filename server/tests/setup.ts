import { beforeEach } from "vitest";
import { resetEverythingToDefaults } from "../src/initRepository.ts";

beforeEach(async () => {
  await resetEverythingToDefaults();
});
