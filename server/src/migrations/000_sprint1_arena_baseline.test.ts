import { beforeEach, describe, expect, it } from "vitest";
import { GameRepo, UserRepo } from "../repository.ts";
import { migration } from "./000_sprint1_arena_baseline.ts";

describe("000_sprint1_arena_baseline", () => {
  beforeEach(async () => {
    await UserRepo.clear();
    await GameRepo.clear();
  });

  it("backfills new fields on legacy UserRecords", async () => {
    const legacyKey = await UserRepo.add({
      username: "legacy_user",
      display: "Legacy User",
      createdAt: new Date("2025-01-01").toISOString(),
    } as unknown as Parameters<typeof UserRepo.add>[0]);

    await migration.up();

    const updated = await UserRepo.get(legacyKey);
    expect(updated.puzzleRating).toEqual({ rating: 1500, rd: 350, vol: 0.06 });
    expect(updated.puzzleStreak).toEqual({ current: 0, best: 0 });
    expect(updated.following).toEqual([]);
    expect(updated.username).toBe("legacy_user");
    expect(updated.display).toBe("Legacy User");
  });

  it("does not overwrite existing values on already-migrated UserRecords", async () => {
    const presetKey = await UserRepo.add({
      username: "preset",
      display: "Preset",
      createdAt: new Date("2025-01-01").toISOString(),
      puzzleRating: { rating: 1700, rd: 200, vol: 0.05 },
      puzzleStreak: { current: 4, best: 9 },
      following: ["someone"],
    });

    await migration.up();

    const after = await UserRepo.get(presetKey);
    expect(after.puzzleRating).toEqual({ rating: 1700, rd: 200, vol: 0.05 });
    expect(after.puzzleStreak).toEqual({ current: 4, best: 9 });
    expect(after.following).toEqual(["someone"]);
  });

  it("backfills new fields on legacy GameRecords", async () => {
    const legacyKey = await GameRepo.add({
      type: "nim",
      done: false,
      chat: "chat-id",
      players: ["user-id"],
      createdAt: new Date("2025-01-01").toISOString(),
      createdBy: "user-id",
    } as unknown as Parameters<typeof GameRepo.add>[0]);

    await migration.up();

    const updated = await GameRepo.get(legacyKey);
    expect(updated.aiPlayers).toEqual([]);
    expect(updated.rated).toBe(false);
    expect(updated.type).toBe("nim");
  });

  it("is idempotent across repeated runs", async () => {
    const legacyKey = await UserRepo.add({
      username: "legacy",
      display: "Legacy",
      createdAt: new Date("2025-01-01").toISOString(),
    } as unknown as Parameters<typeof UserRepo.add>[0]);

    await migration.up();
    const firstPass = await UserRepo.get(legacyKey);
    await migration.up();
    const secondPass = await UserRepo.get(legacyKey);

    expect(secondPass).toEqual(firstPass);
  });
});
