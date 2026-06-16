import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameInfo } from "@gamenite/shared";
import { api } from "./api.ts";
import {
  fetchQueueCounts,
  fetchRating,
  inProgressGamesFor,
  poolSize,
  queueTileLabel,
  type QueueCounts,
} from "./matchmakingService.ts";

vi.mock("./api.ts", () => ({
  api: { get: vi.fn() },
}));

const mockedGet = vi.mocked(api.get);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("matchmakingService.fetchQueueCounts", () => {
  it("GETs the queue endpoint and returns the counts", async () => {
    const counts: QueueCounts = { nim: { rated: 2, unrated: 1 } };
    mockedGet.mockResolvedValueOnce({ data: counts });
    await expect(fetchQueueCounts()).resolves.toBe(counts);
    expect(mockedGet).toHaveBeenCalledWith("/api/matchmaker/queue");
  });

  it("throws on an error message", async () => {
    mockedGet.mockResolvedValueOnce({ data: { error: "down" } });
    await expect(fetchQueueCounts()).rejects.toThrow("down");
  });
});

describe("matchmakingService.fetchRating", () => {
  it("GETs /api/rating/:game/:user and returns the rating", async () => {
    const rating = {
      gameKey: "nim" as const,
      username: "ada",
      rating: 1500,
      rd: 60,
      gamesPlayed: 3,
      provisional: true,
    };
    mockedGet.mockResolvedValueOnce({ data: rating });
    await expect(fetchRating("nim", "ada")).resolves.toBe(rating);
    expect(mockedGet).toHaveBeenCalledWith("/api/rating/nim/ada");
  });

  it("throws on an error message", async () => {
    mockedGet.mockResolvedValueOnce({ data: { error: "no rating" } });
    await expect(fetchRating("nim", "ghost")).rejects.toThrow("no rating");
  });
});

describe("matchmakingService.queueTileLabel", () => {
  it("uses the rated/unrated counts when present", () => {
    expect(queueTileLabel({ rated: 3, unrated: 5 })).toBe("3 in ranked queue · 5 casual");
  });

  it("falls back to zeros when counts are missing", () => {
    expect(queueTileLabel(undefined)).toBe("0 in ranked queue · 0 casual");
  });
});

describe("matchmakingService.poolSize", () => {
  const counts: QueueCounts = { nim: { rated: 4, unrated: 2 } };

  it("returns 0 when the game has no pool yet", () => {
    expect(poolSize(counts, "checkers", true)).toBe(0);
  });

  it("returns the rated or unrated size depending on the flag", () => {
    expect(poolSize(counts, "nim", true)).toBe(4);
    expect(poolSize(counts, "nim", false)).toBe(2);
  });
});

describe("matchmakingService.inProgressGamesFor", () => {
  const games = [
    { status: "active", players: [{ username: "ada" }] },
    { status: "done", players: [{ username: "ada" }] },
    { status: "active", players: [{ username: "bob" }] },
  ] as unknown as GameInfo[];

  it("keeps only unfinished games the user is a player in", () => {
    const mine = inProgressGamesFor(games, "ada");
    expect(mine).toHaveLength(1);
    expect(mine[0].status).toBe("active");
  });

  it("returns an empty list when the user has no live games", () => {
    expect(inProgressGamesFor(games, "carol")).toEqual([]);
  });
});
