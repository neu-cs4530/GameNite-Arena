import { beforeEach, describe, expect, it } from "vitest";
import type { GameKey } from "@gamenite/shared";
import { ratingKey, type MatchRecord } from "../../src/models.ts";
import { MatchRepo, ModelRepo, RatingRepo } from "../../src/repository.ts";
import { getUserByUsername } from "../../src/services/auth.service.ts";
import {
  getLeaderboard,
  invalidateLeaderboardCache,
} from "../../src/services/leaderboard.service.ts";

/** Seeds one RatingRecord; defaults describe a settled (non-provisional) human. */
async function seedRating(
  entityId: string,
  overrides: {
    gameKey?: GameKey;
    entityType?: "human" | "ai";
    rating?: number;
    rd?: number;
    gamesPlayed?: number;
  } = {},
): Promise<void> {
  const gameKey = overrides.gameKey ?? "nim";
  const entityType = overrides.entityType ?? "human";
  await RatingRepo.set(ratingKey({ entityType, entityId, gameKey }), {
    entityId,
    entityType,
    gameKey,
    rating: overrides.rating ?? 1500,
    rd: overrides.rd ?? 80,
    vol: 0.06,
    gamesPlayed: overrides.gamesPlayed ?? 10,
    lastUpdatedAt: "2026-06-01T00:00:00.000Z",
  });
}

/** Seeds one archived match; defaults describe a rated nim win. */
async function seedMatch(
  participants: [string, string],
  overrides: {
    gameKey?: GameKey;
    rated?: boolean;
    winnerId?: string;
    outcome?: MatchRecord["result"]["outcome"];
    completedAt?: string;
    ratingChanges?: { entityId: string; delta: number }[];
  } = {},
): Promise<void> {
  const record: MatchRecord = {
    gameId: "game-under-test",
    gameKey: overrides.gameKey ?? "nim",
    rated: overrides.rated ?? true,
    participants: participants.map((id) => ({ id, type: "human" as const, displayName: id })),
    moves: [],
    result: {
      winnerId: overrides.winnerId,
      outcome: overrides.outcome ?? "win",
      ratingChanges: overrides.ratingChanges,
    },
    createdAt: "2026-06-01T00:00:00.000Z",
    completedAt: overrides.completedAt ?? "2026-06-01T00:05:00.000Z",
  };
  await MatchRepo.add(record);
}

beforeEach(async () => {
  await RatingRepo.clear();
  // The match archive is cleared by tests/setup.ts; the Redis cache is not.
  await invalidateLeaderboardCache("nim");
  await invalidateLeaderboardCache("guess");
});

describe("getLeaderboard win stats", () => {
  it("computes wins and winRate per entry without breaking existing fields", async () => {
    await seedRating("alice", { rating: 1700, gamesPlayed: 4 });
    await seedRating("bob", { rating: 1600, gamesPlayed: 4 });
    await seedMatch(["alice", "bob"], { winnerId: "alice" });
    await seedMatch(["alice", "bob"], { winnerId: "alice" });
    await seedMatch(["alice", "bob"], { winnerId: "alice" });
    await seedMatch(["alice", "bob"], { winnerId: "bob" });

    const page = await getLeaderboard({ gameKey: "nim" });

    expect(page.gameKey).toBe("nim");
    expect(page.entityType).toBe("all");
    expect(page.period).toBe("alltime");
    expect(page.page).toBe(1);
    expect(page.limit).toBe(50);
    expect(page.total).toBe(2);

    expect(page.entries[0]).toMatchObject({
      rank: 1,
      entityId: "alice",
      entityType: "human",
      rating: 1700,
      rd: 80,
      gamesPlayed: 4,
      provisional: false,
      wins: 3,
      winRate: 0.75,
    });
    expect(page.entries[1]).toMatchObject({
      rank: 2,
      entityId: "bob",
      wins: 1,
      winRate: 0.25,
    });
  });

  it("counts only rated matches for the requested game, and never draws", async () => {
    await seedRating("alice", { gamesPlayed: 4 });
    await seedMatch(["alice", "bob"], { winnerId: "alice", rated: false });
    await seedMatch(["alice", "bob"], { winnerId: "alice", gameKey: "guess" });
    await seedMatch(["alice", "bob"], { outcome: "draw" });
    await seedMatch(["alice", "bob"], { winnerId: "alice" });

    const page = await getLeaderboard({ gameKey: "nim" });

    expect(page.entries[0].wins).toBe(1);
    expect(page.entries[0].winRate).toBe(0.25);
  });

  it("reports zero wins and zero winRate for entries with no games played", async () => {
    await seedRating("fresh-player", { gamesPlayed: 0, rd: 350 });

    const page = await getLeaderboard({ gameKey: "nim" });

    expect(page.entries[0].wins).toBe(0);
    expect(page.entries[0].winRate).toBe(0);
    expect(page.entries[0].provisional).toBe(true);
  });

  it("includes the username for human entries so clients can link profiles", async () => {
    const user = await getUserByUsername("user2");
    await seedRating(user!.userId);

    const page = await getLeaderboard({ gameKey: "nim" });

    expect(page.entries[0].username).toBe("user2");
    expect(page.entries[0].displayName).toBe("Sénior Dos");
  });

  it("resolves AI entries from the model repo with no username", async () => {
    const modelId = await ModelRepo.add({
      userId: "someone",
      gameKey: "nim",
      displayName: "NimBot 3000",
      sourceRef: "test",
      visibility: "public",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    await seedRating(modelId, { entityType: "ai" });

    const page = await getLeaderboard({ gameKey: "nim", entityType: "ai" });

    expect(page.entries[0].entityType).toBe("ai");
    expect(page.entries[0].displayName).toBe("NimBot 3000");
    expect(page.entries[0].username).toBeUndefined();
  });

  it("serves cached entries (with win stats intact) until fresh bypasses the cache", async () => {
    await seedRating("alice", { rating: 1500, gamesPlayed: 1 });
    await seedMatch(["alice", "bob"], { winnerId: "alice" });

    const first = await getLeaderboard({ gameKey: "nim" });
    expect(first.entries[0]).toMatchObject({ rating: 1500, wins: 1, winRate: 1 });

    // Simulate a rated game finishing: rating moves, another win recorded.
    await seedRating("alice", { rating: 1580, gamesPlayed: 2 });
    await seedMatch(["alice", "bob"], { winnerId: "alice" });

    // Default read still parses the cached snapshot, win stats included.
    const cached = await getLeaderboard({ gameKey: "nim" });
    expect(cached.entries[0]).toMatchObject({ rating: 1500, wins: 1, winRate: 1 });

    // fresh=true rebuilds from the repos.
    const fresh = await getLeaderboard({ gameKey: "nim", fresh: true });
    expect(fresh.entries[0]).toMatchObject({ rating: 1580, wins: 2, winRate: 1 });

    // ...and re-warms the cache for subsequent default reads.
    const rewarmed = await getLeaderboard({ gameKey: "nim" });
    expect(rewarmed.entries[0]).toMatchObject({ rating: 1580, wins: 2 });
  });
});

describe("getLeaderboard edge cases", () => {
  it("returns an empty page (and caches it) when nobody has a rating", async () => {
    const page = await getLeaderboard({ gameKey: "guess" });
    expect(page.total).toBe(0);
    expect(page.entries).toEqual([]);
    // Second read comes from the cached empty board.
    const cached = await getLeaderboard({ gameKey: "guess" });
    expect(cached.entries).toEqual([]);
  });

  it("falls back to the raw id when a rated entity's record is gone", async () => {
    await seedRating("deleted-user", { rating: 1640 });
    await seedRating("deleted-model", { entityType: "ai", rating: 1620 });

    const page = await getLeaderboard({ gameKey: "nim" });

    const human = page.entries.find((e) => e.entityId === "deleted-user")!;
    const ai = page.entries.find((e) => e.entityId === "deleted-model")!;
    expect(human.displayName).toBe("deleted-user");
    expect(human.username).toBeUndefined();
    expect(ai.displayName).toBe("deleted-model");
  });
});

describe("getLeaderboard daily period", () => {
  it("ranks by today's rating gain and counts today's games/wins", async () => {
    await seedRating("alice", { rating: 1620, gamesPlayed: 5 });
    await seedRating("bob", { rating: 1580, gamesPlayed: 5 });
    await seedMatch(["alice", "bob"], {
      winnerId: "alice",
      completedAt: "2026-06-01T10:00:00.000Z",
      ratingChanges: [
        { entityId: "alice", delta: 20 },
        { entityId: "bob", delta: -20 },
      ],
    });

    const page = await getLeaderboard({
      gameKey: "nim",
      period: "daily",
      now: new Date("2026-06-01T18:00:00.000Z"),
    });

    expect(page.period).toBe("daily");
    expect(page.entries[0]).toMatchObject({
      entityId: "alice",
      rating: 1620,
      ratingDelta: 20,
      gamesPlayedToday: 1,
      wins: 1,
      winRate: 1,
    });
    expect(page.entries[1]).toMatchObject({
      entityId: "bob",
      rating: 1580,
      ratingDelta: -20,
      gamesPlayedToday: 1,
      wins: 0,
      winRate: 0,
    });
  });

  it("excludes matches completed before today (UTC midnight cutoff)", async () => {
    await seedRating("alice", { rating: 1500 });
    await seedMatch(["alice", "bob"], {
      winnerId: "alice",
      completedAt: "2026-05-31T23:59:00.000Z",
      ratingChanges: [{ entityId: "alice", delta: 30 }],
    });

    const page = await getLeaderboard({
      gameKey: "nim",
      period: "daily",
      now: new Date("2026-06-01T00:30:00.000Z"),
    });

    expect(page.entries).toHaveLength(0);
  });

  it("respects the entityType filter", async () => {
    await seedRating("alice", { rating: 1500 });
    await seedRating("bob", { rating: 1500 });
    await seedMatch(["alice", "bob"], {
      winnerId: "alice",
      completedAt: "2026-06-01T10:00:00.000Z",
      ratingChanges: [
        { entityId: "alice", delta: 10 },
        { entityId: "bob", delta: -10 },
      ],
    });

    const now = new Date("2026-06-01T18:00:00.000Z");
    const humans = await getLeaderboard({
      gameKey: "nim",
      period: "daily",
      entityType: "human",
      now,
    });
    const ais = await getLeaderboard({ gameKey: "nim", period: "daily", entityType: "ai", now });

    expect(humans.entries).toHaveLength(2);
    expect(ais.entries).toHaveLength(0);
  });

  it("works without an explicit now (falls back to current time)", async () => {
    const page = await getLeaderboard({ gameKey: "nim", period: "daily" });
    expect(page.period).toBe("daily");
    expect(Array.isArray(page.entries)).toBe(true);
  });

  it("falls back to default rating values when a participant has no prior rating record", async () => {
    const now = new Date("2026-06-16T18:00:00.000Z");
    await seedMatch(["fresh", "bob"], {
      completedAt: "2026-06-16T10:00:00.000Z",
      winnerId: "fresh",
      ratingChanges: [{ entityId: "fresh", delta: 15 }],
    });
    const page = await getLeaderboard({ gameKey: "nim", period: "daily", now: now });
    const entry = page.entries.find((e) => e.entityId === "fresh")!;
    expect(entry.rating).toBe(1500);
    expect(entry.rd).toBe(350);
    expect(entry.gamesPlayedToday).toBe(1);
  });

  it("ignores matches that have no ratingChanges recorded", async () => {
    const now = new Date("2026-06-16T18:00:00.000Z");
    await seedRating("alice", { rating: 1600 });
    await seedMatch(["alice", "bob"], {
      completedAt: "2026-06-16T10:00:00.000Z",
      winnerId: "alice",
    });
    const page = await getLeaderboard({ gameKey: "nim", period: "daily", now: now });
    expect(page.entries).toHaveLength(0);
  });

  it("skips a ratingChange whose entityId is not in the match participants", async () => {
    const now = new Date("2026-06-16T18:00:00.000Z");
    await seedMatch(["alice", "bob"], {
      completedAt: "2026-06-16T10:00:00.000Z",
      winnerId: "alice",
      ratingChanges: [{ entityId: "charlie", delta: 20 }],
    });
    const page = await getLeaderboard({ gameKey: "nim", period: "daily", now: now });
    expect(page.entries.find((e) => e.entityId === "charlie")).toBeUndefined();
  });
});
