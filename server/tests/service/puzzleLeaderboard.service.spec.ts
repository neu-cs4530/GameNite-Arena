import { beforeEach, describe, expect, it } from "vitest";
import type { GameKey } from "@gamenite/shared";
import type { GlickoRating, PuzzleStreak } from "../../src/models.ts";
import { PuzzleAttemptRepo, PuzzleRepo, UserRepo } from "../../src/repository.ts";
import { getUserByUsername } from "../../src/services/auth.service.ts";
import { submitAttempt } from "../../src/services/puzzle.service.ts";
import {
  getPuzzleLeaderboard,
  invalidatePuzzleLeaderboardCache,
} from "../../src/services/puzzleLeaderboard.service.ts";
import { dayBefore, todayYmd } from "../../src/services/puzzleStreak.util.ts";

/* ---------------------------------------------------------------------------
 * The puzzle leaderboard is built from UserRepo (per-game puzzleRatings +
 * streak) and PuzzleAttemptRepo (attempts/solves), cached in Redis for five
 * minutes under puzzleLeaderboard:<scope> — keys distinct from the match
 * leaderboard's leaderboard:<game>:<type> family.
 * ------------------------------------------------------------------------- */

function rating(value: number, rd = 80): GlickoRating {
  return { rating: value, rd, vol: 0.06 };
}

/** Seeds one user with puzzle ratings; returns the new userId. */
async function seedRatedUser(
  username: string,
  ratings: Partial<Record<GameKey, GlickoRating>>,
  streak: PuzzleStreak = { current: 0, best: 0 },
): Promise<string> {
  return UserRepo.add({
    username,
    display: `${username} display`,
    createdAt: "2026-01-01T00:00:00.000Z",
    puzzleRatings: ratings,
    puzzleStreak: streak,
    following: [],
  });
}

/** Logs one puzzle attempt for a user against `<gameKey>:<date>`. */
async function seedAttempt(
  userId: string,
  gameKey: GameKey,
  date: string,
  success: boolean,
): Promise<void> {
  await PuzzleAttemptRepo.add({
    puzzleId: `${gameKey}:${date}`,
    attemptedBy: { id: userId, type: "human" },
    success,
    rated: true,
    timeMs: 1000,
    hintsUsed: 0,
    eloDelta: success ? 12 : -12,
    createdAt: "2026-06-01T00:00:00.000Z",
  });
}

beforeEach(async () => {
  await PuzzleRepo.clear();
  await PuzzleAttemptRepo.clear();
  // UserRepo is reseeded by the global setup; the Redis cache is not.
  await invalidatePuzzleLeaderboardCache("nim");
  await invalidatePuzzleLeaderboardCache("guess");
});

describe("getPuzzleLeaderboard: per-game scope", () => {
  it("ranks users with a rating for that game by rating, with stats and streaks", async () => {
    const today = todayYmd();
    const alice = await seedRatedUser(
      "p-alice",
      { nim: rating(1700) },
      {
        current: 4,
        best: 6,
        lastSolvedAt: today,
      },
    );
    await seedRatedUser(
      "p-bob",
      { nim: rating(1600, 350) },
      {
        current: 9,
        best: 9,
        lastSolvedAt: "2026-01-05", // long dead — effectiveStreak serves 0
      },
    );
    // rated in guess only: excluded from the nim board entirely
    await seedRatedUser("p-carol", { guess: rating(1800) });

    // four nim attempts (two solves) + one guess attempt that must not count
    await seedAttempt(alice, "nim", "2026-06-01", true);
    await seedAttempt(alice, "nim", "2026-06-02", false);
    await seedAttempt(alice, "nim", "2026-06-03", false);
    await seedAttempt(alice, "nim", "2026-06-04", true);
    await seedAttempt(alice, "guess", "2026-06-04", true);

    const page = await getPuzzleLeaderboard({ scope: "nim" });

    expect(page.scope).toBe("nim");
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(50);
    expect(page.total).toBe(2);

    expect(page.entries[0]).toStrictEqual({
      rank: 1,
      username: "p-alice",
      displayName: "p-alice display",
      rating: 1700,
      provisional: false,
      attempts: 4,
      solves: 2,
      solveRate: 0.5,
      streakCurrent: 4,
      streakBest: 6,
    });
    expect(page.entries[1]).toStrictEqual({
      rank: 2,
      username: "p-bob",
      displayName: "p-bob display",
      rating: 1600,
      provisional: true, // rd 350 is provisional
      attempts: 0,
      solves: 0,
      solveRate: 0,
      streakCurrent: 0, // stale chain zeroed by effectiveStreak
      streakBest: 9,
    });
  });
});

describe("getPuzzleLeaderboard: overall scope", () => {
  it("blends per-game ratings into their mean and aggregates attempts across games", async () => {
    const alice = await seedRatedUser("o-alice", {
      nim: rating(1600),
      guess: rating(1400),
    });
    await seedRatedUser("o-bob", { nim: rating(1700) });

    await seedAttempt(alice, "nim", "2026-06-01", true);
    await seedAttempt(alice, "guess", "2026-06-01", false);

    const page = await getPuzzleLeaderboard({ scope: "overall" });

    expect(page.scope).toBe("overall");
    expect(page.total).toBe(2);
    // bob's single-game 1700 outranks alice's (1600+1400)/2 = 1500
    expect(page.entries[0]).toMatchObject({ rank: 1, username: "o-bob", rating: 1700 });
    expect(page.entries[1]).toMatchObject({
      rank: 2,
      username: "o-alice",
      rating: 1500,
      attempts: 2,
      solves: 1,
      solveRate: 0.5,
    });
  });

  it("excludes users who have never earned any puzzle rating", async () => {
    // the four seeded default users all carry empty puzzleRatings maps
    const page = await getPuzzleLeaderboard({ scope: "overall" });
    expect(page.total).toBe(0);
    expect(page.entries).toStrictEqual([]);
  });
});

describe("getPuzzleLeaderboard: pagination", () => {
  it("slices ranked entries into pages and reports the full total", async () => {
    for (let i = 0; i < 5; i += 1) {
      await seedRatedUser(`pg-user-${i}`, { nim: rating(1900 - i * 100) });
    }

    const page = await getPuzzleLeaderboard({ scope: "nim", page: 2, limit: 2 });

    expect(page.page).toBe(2);
    expect(page.pageSize).toBe(2);
    expect(page.total).toBe(5);
    expect(page.entries.map((e) => e.rank)).toStrictEqual([3, 4]);
    expect(page.entries.map((e) => e.username)).toStrictEqual(["pg-user-2", "pg-user-3"]);
  });

  it("clamps page to >= 1 and limit to 1..100", async () => {
    await seedRatedUser("pg-solo", { nim: rating(1500) });

    const clampedLow = await getPuzzleLeaderboard({ scope: "nim", page: 0, limit: 0 });
    expect(clampedLow.page).toBe(1);
    expect(clampedLow.pageSize).toBe(1);
    expect(clampedLow.entries).toHaveLength(1);

    const clampedHigh = await getPuzzleLeaderboard({ scope: "nim", page: 1, limit: 500 });
    expect(clampedHigh.pageSize).toBe(100);
  });
});

describe("puzzle leaderboard caching", () => {
  it("serves the cached board until the game's cache (and overall) is invalidated", async () => {
    const aliceId = await seedRatedUser("c-alice", { nim: rating(1500) });

    // warm both scopes
    expect((await getPuzzleLeaderboard({ scope: "nim" })).entries[0].rating).toBe(1500);
    expect((await getPuzzleLeaderboard({ scope: "overall" })).entries[0].rating).toBe(1500);

    // a rating change lands in the repo...
    const alice = await UserRepo.get(aliceId);
    await UserRepo.set(aliceId, { ...alice, puzzleRatings: { nim: rating(1580) } });

    // ...but both cached boards still serve the snapshot
    expect((await getPuzzleLeaderboard({ scope: "nim" })).entries[0].rating).toBe(1500);
    expect((await getPuzzleLeaderboard({ scope: "overall" })).entries[0].rating).toBe(1500);

    // invalidating the game drops that board AND the overall blend
    await invalidatePuzzleLeaderboardCache("nim");
    expect((await getPuzzleLeaderboard({ scope: "nim" })).entries[0].rating).toBe(1580);
    expect((await getPuzzleLeaderboard({ scope: "overall" })).entries[0].rating).toBe(1580);
  });

  it("is invalidated by submitAttempt after a rated change", async () => {
    const today = todayYmd();
    await PuzzleRepo.set(`nim:${today}`, {
      gameKey: "nim",
      date: today,
      position: { remaining: 6, nextPlayer: 1 },
      solution: { moves: [1], explanation: "seeded by test" },
      createdAt: new Date().toISOString(),
    });
    const userId = (await getUserByUsername("user1"))!.userId;

    // warm the cache with the pre-solve (empty) board
    expect((await getPuzzleLeaderboard({ scope: "nim" })).total).toBe(0);
    expect((await getPuzzleLeaderboard({ scope: "overall" })).total).toBe(0);

    const outcome = await submitAttempt(userId, "nim", { move: 1, timeMs: 500, date: today });
    expect(outcome!.rated).toBe(true);

    // no manual invalidation: the rated solve already dropped both caches
    const nimBoard = await getPuzzleLeaderboard({ scope: "nim" });
    expect(nimBoard.total).toBe(1);
    expect(nimBoard.entries[0]).toMatchObject({
      username: "user1",
      attempts: 1,
      solves: 1,
      solveRate: 1,
      streakCurrent: 1,
      streakBest: 1,
    });
    expect(nimBoard.entries[0].rating).toBeGreaterThan(1500);

    const overallBoard = await getPuzzleLeaderboard({ scope: "overall" });
    expect(overallBoard.total).toBe(1);
    expect(overallBoard.entries[0].username).toBe("user1");
  });

  it("keeps yesterday's fresh streak alive in the served streakCurrent", async () => {
    await seedRatedUser(
      "c-yesterday",
      { nim: rating(1550) },
      {
        current: 3,
        best: 5,
        lastSolvedAt: dayBefore(todayYmd()),
      },
    );

    const page = await getPuzzleLeaderboard({ scope: "nim" });

    expect(page.entries[0]).toMatchObject({ streakCurrent: 3, streakBest: 5 });
  });
});
