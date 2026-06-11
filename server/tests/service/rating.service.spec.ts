import { beforeEach, describe, expect, it } from "vitest";
import { ratingKey, type GameRecord, type MatchRecord } from "../../src/models.ts";
import { MatchRepo, RatingRepo } from "../../src/repository.ts";
import {
  DEFAULT_RATING,
  DEFAULT_RD,
  DEFAULT_VOLATILITY,
} from "../../src/services/glicko2.service.ts";
import { getRating, updateRatingsForGame } from "../../src/services/rating.service.ts";
import { createRedisConnection } from "../../src/services/redis.ts";

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
      await redis.set("leaderboard:nim:all", "stale");
      await redis.set("leaderboard:nim:human", "stale");
      await redis.set("leaderboard:nim:ai", "stale");
      const game: GameRecord = {
        ...baseGame,
        state: { remaining: 0, nextPlayer: 1 },
      };

      await updateRatingsForGame(game, "game-cache");

      expect(await redis.get("leaderboard:nim:all")).toBeNull();
      expect(await redis.get("leaderboard:nim:human")).toBeNull();
      expect(await redis.get("leaderboard:nim:ai")).toBeNull();
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
