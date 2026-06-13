import { beforeEach, describe, expect, it } from "vitest";
import { ratingKey, type GameRecord, type MatchRecord } from "../../src/models.ts";
import { MatchRepo, RatingRepo } from "../../src/repository.ts";
import {
  DEFAULT_RATING,
  DEFAULT_RD,
  DEFAULT_VOLATILITY,
} from "../../src/services/glicko2.service.ts";
import {
  getRating,
  getRatingForEntity,
  getRatingSummary,
  updateRatingsForGame,
} from "../../src/services/rating.service.ts";
import { createRedisConnection } from "../../src/services/redis.ts";
import { leaderboardCacheKey } from "../../src/services/leaderboard.service.ts";

const baseGame: GameRecord = {
  type: "nim",
  done: true,
  chat: "chat-1",
  players: ["alice", "bob"],
  aiPlayers: [],
  rated: true,
  createdAt: "2026-06-01T00:00:00.000Z",
  createdBy: "alice",
};

function baseMatch(gameKey: GameRecord["type"]): MatchRecord {
  return {
    gameId: "ignored-by-repo-key",
    gameKey,
    rated: true,
    participants: [
      { id: "alice", type: "human", displayName: "alice" },
      { id: "bob", type: "human", displayName: "bob" },
    ],
    moves: [],
    result: { outcome: "win" }, // the _defaultResult() stub
    createdAt: "2026-06-01T00:00:00.000Z",
    completedAt: "2026-06-01T00:05:00.000Z",
  };
}

beforeEach(async () => {
  await RatingRepo.clear();
});

describe("getRating", () => {
  it("returns a fresh default rating for a player who hasn't played", async () => {
    const rating = await getRating("new-player", "nim");
    expect(rating).toEqual({
      rating: DEFAULT_RATING,
      rd: DEFAULT_RD,
      volatility: DEFAULT_VOLATILITY,
    });
  });

  it("returns a player's stored rating", async () => {
    await RatingRepo.set(ratingKey({ entityType: "human", entityId: "vet", gameKey: "nim" }), {
      entityId: "vet",
      entityType: "human",
      gameKey: "nim",
      rating: 1700,
      rd: 80,
      vol: 0.05,
      gamesPlayed: 12,
      lastUpdatedAt: "2026-06-01T00:00:00.000Z",
    });

    const rating = await getRating("vet", "nim");
    expect(rating).toEqual({ rating: 1700, rd: 80, volatility: 0.05 });
  });
});

describe("updateRatingsForGame", () => {
  it("rewards the misere-nim winner and penalizes the loser", async () => {
    const game: GameRecord = {
      ...baseGame,
      state: { remaining: 0, nextPlayer: 1 }, // alice (index 0) took the last object, so bob wins
    };

    await updateRatingsForGame(game, "game-1");

    const aliceRating = await getRating("alice", "nim");
    const bobRating = await getRating("bob", "nim");

    expect(bobRating.rating).toBeGreaterThan(DEFAULT_RATING);
    expect(aliceRating.rating).toBeLessThan(DEFAULT_RATING);
  });

  it("invalidates the cached leaderboard so the board can't contradict new ratings", async () => {
    const redis = createRedisConnection();
    try {
      await redis.set(leaderboardCacheKey("nim", "all"), "stale");
      await redis.set(leaderboardCacheKey("nim", "human"), "stale");
      await redis.set(leaderboardCacheKey("nim", "ai"), "stale");
      const game: GameRecord = {
        ...baseGame,
        state: { remaining: 0, nextPlayer: 1 },
      };

      await updateRatingsForGame(game, "game-cache");

      expect(await redis.get(leaderboardCacheKey("nim", "all"))).toBeNull();
      expect(await redis.get(leaderboardCacheKey("nim", "human"))).toBeNull();
      expect(await redis.get(leaderboardCacheKey("nim", "ai"))).toBeNull();
    } finally {
      await redis.quit();
    }
  });

  it("rewards the closer guesser in a guess game", async () => {
    const game: GameRecord = {
      ...baseGame,
      type: "guess",
      state: { secret: 50, guesses: [45, 30] }, // alice diff=5, bob diff=20 -> alice wins
    };

    await updateRatingsForGame(game, "game-2");

    const aliceRating = await getRating("alice", "guess");
    const bobRating = await getRating("bob", "guess");

    expect(aliceRating.rating).toBeGreaterThan(DEFAULT_RATING);
    expect(bobRating.rating).toBeLessThan(DEFAULT_RATING);
  });

  it("patches the MatchRecord result with the winner and rating changes", async () => {
    const game: GameRecord = {
      ...baseGame,
      state: { remaining: 0, nextPlayer: 1 }, // bob wins
    };
    await MatchRepo.set("game-3", baseMatch("nim"));

    await updateRatingsForGame(game, "game-3");

    const match = await MatchRepo.get("game-3");
    expect(match.result.winnerId).toBe("bob");
    expect(match.result.outcome).toBe("win");
    expect(match.result.ratingChanges).toEqual([
      { entityId: "alice", delta: expect.any(Number) },
      { entityId: "bob", delta: expect.any(Number) },
    ]);
    expect(match.result.ratingChanges![0].delta).toBeLessThan(0);
    expect(match.result.ratingChanges![1].delta).toBeGreaterThan(0);
  });

  it("records a draw when a guess game ends in an exact tie", async () => {
    const game: GameRecord = {
      ...baseGame,
      type: "guess",
      state: { secret: 50, guesses: [45, 55] }, // both diff=5 -> draw
    };
    await MatchRepo.set("game-4", baseMatch("guess"));

    await updateRatingsForGame(game, "game-4");

    const match = await MatchRepo.get("game-4");
    expect(match.result.winnerId).toBeUndefined();
    expect(match.result.outcome).toBe("draw");
  });

  it("still updates ratings when no MatchRecord exists for the game", async () => {
    const game: GameRecord = {
      ...baseGame,
      state: { remaining: 0, nextPlayer: 1 },
    };

    await updateRatingsForGame(game, "no-such-match");

    const bobRating = await getRating("bob", "nim");
    expect(bobRating.rating).toBeGreaterThan(DEFAULT_RATING);
  });

  it("does nothing for games that aren't 1v1", async () => {
    const game: GameRecord = {
      ...baseGame,
      type: "guess",
      players: ["alice", "bob", "carol"],
      state: { secret: 50, guesses: [45, 55, 50] },
    };

    await updateRatingsForGame(game, "game-5");

    const record = await RatingRepo.find(
      ratingKey({ entityType: "human", entityId: "alice", gameKey: "guess" }),
    );
    expect(record).toBeNull();
  });

  it("increments gamesPlayed each time a player's rating is updated", async () => {
    const game: GameRecord = {
      ...baseGame,
      state: { remaining: 0, nextPlayer: 1 },
    };

    await updateRatingsForGame(game, "game-6a");
    await updateRatingsForGame(game, "game-6b");

    const record = await RatingRepo.find(
      ratingKey({ entityType: "human", entityId: "bob", gameKey: "nim" }),
    );
    expect(record!.gamesPlayed).toBe(2);
  });
});

describe("getRatingForEntity", () => {
  it("reads model ratings from the ai-prefixed key", async () => {
    await RatingRepo.set(ratingKey({ entityType: "ai", entityId: "model-1", gameKey: "nim" }), {
      entityId: "model-1",
      entityType: "ai",
      gameKey: "nim",
      rating: 1800,
      rd: 90,
      vol: 0.05,
      gamesPlayed: 4,
      lastUpdatedAt: "2026-06-01T00:00:00.000Z",
    });

    const rating = await getRatingForEntity({ type: "ai", id: "model-1" }, "nim");
    expect(rating).toEqual({ rating: 1800, rd: 90, volatility: 0.05 });
  });

  it("returns a fresh default rating for an unrated model", async () => {
    const rating = await getRatingForEntity({ type: "ai", id: "model-unrated" }, "nim");
    expect(rating).toEqual({
      rating: DEFAULT_RATING,
      rd: DEFAULT_RD,
      volatility: DEFAULT_VOLATILITY,
    });
  });

  it("matches getRating for human entities", async () => {
    await RatingRepo.set(ratingKey({ entityType: "human", entityId: "vet", gameKey: "nim" }), {
      entityId: "vet",
      entityType: "human",
      gameKey: "nim",
      rating: 1700,
      rd: 80,
      vol: 0.05,
      gamesPlayed: 12,
      lastUpdatedAt: "2026-06-01T00:00:00.000Z",
    });

    expect(await getRatingForEntity({ type: "human", id: "vet" }, "nim")).toEqual(
      await getRating("vet", "nim"),
    );
  });
});

describe("updateRatingsForGame with AI seats", () => {
  const aiSeat = { deploymentId: "dep-1", modelId: "model-1", displayName: "NimBot" };
  const aiGame: GameRecord = {
    ...baseGame,
    players: ["alice", "dep-1"],
    aiPlayers: [null, aiSeat],
    state: { remaining: 0, nextPlayer: 1 }, // alice took the last object: the AI seat wins
  };

  it("writes the model's rating under ai:<modelId> and the human's under human:", async () => {
    await updateRatingsForGame(aiGame, "game-ai-1");

    const modelRecord = await RatingRepo.find(
      ratingKey({ entityType: "ai", entityId: "model-1", gameKey: "nim" }),
    );
    const humanRecord = await RatingRepo.find(
      ratingKey({ entityType: "human", entityId: "alice", gameKey: "nim" }),
    );

    expect(modelRecord).not.toBeNull();
    expect(modelRecord!.entityType).toBe("ai");
    expect(modelRecord!.entityId).toBe("model-1");
    expect(modelRecord!.rating).toBeGreaterThan(DEFAULT_RATING);
    expect(modelRecord!.gamesPlayed).toBe(1);

    expect(humanRecord).not.toBeNull();
    expect(humanRecord!.entityType).toBe("human");
    expect(humanRecord!.rating).toBeLessThan(DEFAULT_RATING);

    // No rating leaked under the seat id or a human-keyed model id.
    expect(
      await RatingRepo.find(ratingKey({ entityType: "human", entityId: "dep-1", gameKey: "nim" })),
    ).toBeNull();
    expect(
      await RatingRepo.find(
        ratingKey({ entityType: "human", entityId: "model-1", gameKey: "nim" }),
      ),
    ).toBeNull();
  });

  it("keeps the seat id as winnerId but uses the model id in ratingChanges", async () => {
    const result = await updateRatingsForGame(aiGame, "game-ai-2");

    expect(result).toBeDefined();
    expect(result!.winnerId).toBe("dep-1");
    expect(result!.outcome).toBe("win");
    expect(result!.ratingChanges).toEqual([
      { entityId: "alice", delta: expect.any(Number) },
      { entityId: "model-1", delta: expect.any(Number) },
    ]);
    expect(result!.ratingChanges![0].delta).toBeLessThan(0);
    expect(result!.ratingChanges![1].delta).toBeGreaterThan(0);
  });

  it("rates a model-vs-model game under both model ids", async () => {
    const bots: GameRecord = {
      ...baseGame,
      players: ["dep-1", "dep-2"],
      aiPlayers: [aiSeat, { deploymentId: "dep-2", modelId: "model-2", displayName: "OtherBot" }],
      state: { remaining: 0, nextPlayer: 0 }, // seat 1 took the last object: seat 0 wins
    };

    const result = await updateRatingsForGame(bots, "game-ai-3");

    expect(result!.winnerId).toBe("dep-1");
    expect(result!.ratingChanges).toEqual([
      { entityId: "model-1", delta: expect.any(Number) },
      { entityId: "model-2", delta: expect.any(Number) },
    ]);
    const winner = await RatingRepo.find(
      ratingKey({ entityType: "ai", entityId: "model-1", gameKey: "nim" }),
    );
    const loser = await RatingRepo.find(
      ratingKey({ entityType: "ai", entityId: "model-2", gameKey: "nim" }),
    );
    expect(winner!.rating).toBeGreaterThan(DEFAULT_RATING);
    expect(loser!.rating).toBeLessThan(DEFAULT_RATING);
  });
});

describe("updateRatingsForGame with a forced forfeit result", () => {
  const aiSeat = { deploymentId: "dep-1", modelId: "model-1", displayName: "NimBot" };
  // Mid-game state: the forfeit decides the game, not the board.
  const forfeitGame: GameRecord = {
    ...baseGame,
    players: ["alice", "dep-1"],
    aiPlayers: [null, aiSeat],
    state: { remaining: 9, nextPlayer: 1 },
  };

  it("scores the surviving seat 0 as the winner and reports outcome forfeit", async () => {
    const result = await updateRatingsForGame(forfeitGame, "game-f-1", {
      winnerId: "alice",
      outcome: "forfeit",
    });

    expect(result).toEqual({
      winnerId: "alice",
      outcome: "forfeit",
      ratingChanges: [
        { entityId: "alice", delta: expect.any(Number) },
        { entityId: "model-1", delta: expect.any(Number) },
      ],
    });
    expect(result!.ratingChanges![0].delta).toBeGreaterThan(0);
    expect(result!.ratingChanges![1].delta).toBeLessThan(0);
  });

  it("scores the surviving seat 1 as the winner when seat 0 forfeits", async () => {
    const flipped: GameRecord = {
      ...forfeitGame,
      players: ["dep-1", "alice"],
      aiPlayers: [aiSeat, null],
    };

    const result = await updateRatingsForGame(flipped, "game-f-2", {
      winnerId: "alice",
      outcome: "forfeit",
    });

    expect(result!.winnerId).toBe("alice");
    expect(result!.ratingChanges![0].delta).toBeLessThan(0); // model-1, seat 0
    expect(result!.ratingChanges![1].delta).toBeGreaterThan(0); // alice, seat 1
  });

  it("patches the archived MatchRecord with the forfeit result", async () => {
    await MatchRepo.set("game-f-3", baseMatch("nim"));

    await updateRatingsForGame(forfeitGame, "game-f-3", {
      winnerId: "alice",
      outcome: "forfeit",
    });

    const match = await MatchRepo.get("game-f-3");
    expect(match.result.outcome).toBe("forfeit");
    expect(match.result.winnerId).toBe("alice");
    expect(match.result.ratingChanges).toHaveLength(2);
  });
});

describe("getRatingSummary", () => {
  it("defaults to a provisional 1500 for a player with no record", async () => {
    const summary = await getRatingSummary("nobody", "nim");
    expect(summary).toEqual({
      rating: DEFAULT_RATING,
      rd: DEFAULT_RD,
      gamesPlayed: 0,
      provisional: true,
    });
  });

  it("reports a settled record as non-provisional", async () => {
    await RatingRepo.set(ratingKey({ entityType: "human", entityId: "vet", gameKey: "nim" }), {
      entityId: "vet",
      entityType: "human",
      gameKey: "nim",
      rating: 1700,
      rd: 80,
      vol: 0.05,
      gamesPlayed: 12,
      lastUpdatedAt: "2026-06-01T00:00:00.000Z",
    });

    const summary = await getRatingSummary("vet", "nim");
    expect(summary).toEqual({ rating: 1700, rd: 80, gamesPlayed: 12, provisional: false });
  });

  it("stays provisional with a low rd but zero games played", async () => {
    await RatingRepo.set(ratingKey({ entityType: "human", entityId: "fresh", gameKey: "nim" }), {
      entityId: "fresh",
      entityType: "human",
      gameKey: "nim",
      rating: 1500,
      rd: 80,
      vol: 0.05,
      gamesPlayed: 0,
      lastUpdatedAt: "2026-06-01T00:00:00.000Z",
    });

    const summary = await getRatingSummary("fresh", "nim");
    expect(summary.provisional).toBe(true);
  });
});

describe("updateRatingsForGame guess edge", () => {
  it("treats a missing guess as zero when picking the winner", async () => {
    const game: GameRecord = {
      ...baseGame,
      type: "guess",
      state: { secret: 50, guesses: [null, 30] }, // alice never guessed: |0-50| vs |30-50|
    };

    const result = await updateRatingsForGame(game, "game-null-guess");

    expect(result!.winnerId).toBe("bob");
  });
});
