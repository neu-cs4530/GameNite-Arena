import { beforeEach, describe, expect, it } from "vitest";
import { UserRepo } from "../repository.ts";
import { migration } from "./002_per_game_puzzle_ratings.ts";

/** A pre-002 UserRecord: one global puzzleRating, no puzzleRatings map. */
function legacyUser(overrides: Record<string, unknown> = {}) {
  return {
    username: "legacy_user",
    display: "Legacy User",
    createdAt: new Date("2025-01-01").toISOString(),
    puzzleStreak: { current: 2, best: 5 },
    following: [],
    ...overrides,
  } as unknown as Parameters<typeof UserRepo.add>[0];
}

describe("002_per_game_puzzle_ratings", () => {
  beforeEach(async () => {
    await UserRepo.clear();
  });

  it("moves a legacy non-default puzzleRating into puzzleRatings.nim", async () => {
    const key = await UserRepo.add(
      legacyUser({ puzzleRating: { rating: 1610, rd: 180, vol: 0.06 } }),
    );

    await migration.up();

    const after = await UserRepo.get(key);
    // nim is the only puzzle game that has ever existed, so the legacy
    // global rating must have been earned there
    expect(after.puzzleRatings).toStrictEqual({ nim: { rating: 1610, rd: 180, vol: 0.06 } });
    expect("puzzleRating" in (after as unknown as Record<string, unknown>)).toBe(false);
    // unrelated fields survive the rewrite
    expect(after.username).toBe("legacy_user");
    expect(after.puzzleStreak).toStrictEqual({ current: 2, best: 5 });
  });

  it("drops an untouched default (1500/350) instead of seeding the leaderboard", async () => {
    const key = await UserRepo.add(
      legacyUser({ puzzleRating: { rating: 1500, rd: 350, vol: 0.06 } }),
    );

    await migration.up();

    const after = await UserRepo.get(key);
    // an untouched default is indistinguishable from "never played"
    expect(after.puzzleRatings).toStrictEqual({});
    expect("puzzleRating" in (after as unknown as Record<string, unknown>)).toBe(false);
  });

  it("leaves already-migrated records untouched", async () => {
    const key = await UserRepo.add(
      legacyUser({ puzzleRatings: { nim: { rating: 1700, rd: 90, vol: 0.05 } } }),
    );
    const before = await UserRepo.get(key);

    await migration.up();

    expect(await UserRepo.get(key)).toStrictEqual(before);
  });

  it("is idempotent across repeated runs", async () => {
    const migratedKey = await UserRepo.add(
      legacyUser({ puzzleRating: { rating: 1610, rd: 180, vol: 0.06 } }),
    );
    const defaultKey = await UserRepo.add(
      legacyUser({
        username: "legacy_default",
        puzzleRating: { rating: 1500, rd: 350, vol: 0.06 },
      }),
    );

    await migration.up();
    const firstPassMigrated = await UserRepo.get(migratedKey);
    const firstPassDefault = await UserRepo.get(defaultKey);

    await migration.up();

    expect(await UserRepo.get(migratedKey)).toStrictEqual(firstPassMigrated);
    expect(await UserRepo.get(defaultKey)).toStrictEqual(firstPassDefault);
    expect(firstPassMigrated.puzzleRatings).toStrictEqual({
      nim: { rating: 1610, rd: 180, vol: 0.06 },
    });
  });
});
