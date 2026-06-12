import { describe, expect, it } from "vitest";
import { computeRankMovement, neighborSlice } from "./rankMovement.ts";
import type { LeaderboardEntry } from "./types.ts";

/** Builds a ranked board from [entityId, rating, gamesPlayed] triples. */
function boardOf(rows: [string, number, number][]): LeaderboardEntry[] {
  return rows.map(([entityId, rating, gamesPlayed], index) => ({
    rank: index + 1,
    entityId,
    entityType: "human" as const,
    displayName: entityId,
    username: entityId,
    rating,
    rd: 80,
    gamesPlayed,
    provisional: false,
    wins: 0,
    winRate: 0,
  }));
}

describe("computeRankMovement", () => {
  it("detects moving up the board", () => {
    const board = boardOf([
      ["a", 1700, 20],
      ["me", 1650, 10],
      ["b", 1600, 20],
      ["c", 1550, 20],
    ]);
    // Previous rating 1590 would have ranked below a and b: prevRank 3.
    expect(computeRankMovement(board, "me", 60)).toEqual({
      newRank: 2,
      prevRank: 3,
      direction: "up",
      places: 1,
    });
  });

  it("detects moving down the board", () => {
    const board = boardOf([
      ["a", 1700, 20],
      ["me", 1650, 10],
      ["b", 1600, 20],
    ]);
    // Previous rating 1710 would have topped the board: prevRank 1.
    expect(computeRankMovement(board, "me", -60)).toEqual({
      newRank: 2,
      prevRank: 1,
      direction: "down",
      places: 1,
    });
  });

  it("reports no movement when the rank is unchanged", () => {
    const board = boardOf([
      ["a", 1700, 20],
      ["me", 1650, 10],
      ["b", 1600, 20],
    ]);
    expect(computeRankMovement(board, "me", 5)).toEqual({
      newRank: 2,
      prevRank: 2,
      direction: "none",
      places: 0,
    });
  });

  it("treats a first rated game as entering the board", () => {
    const board = boardOf([
      ["a", 1700, 20],
      ["me", 1650, 1],
    ]);
    expect(computeRankMovement(board, "me", 150)).toEqual({
      newRank: 2,
      prevRank: null,
      direction: "new",
      places: 0,
    });
  });

  it("only counts strictly higher ratings when re-ranking the previous rating", () => {
    const board = boardOf([
      ["a", 1700, 20],
      ["me", 1650, 10],
      ["tied", 1590, 20],
    ]);
    // Previous rating exactly ties "tied" (1590): prevRank stays 2.
    expect(computeRankMovement(board, "me", 60)?.prevRank).toBe(2);
  });

  it("returns null when the player is not on the board", () => {
    expect(computeRankMovement(boardOf([["a", 1700, 20]]), "me", 10)).toBeNull();
  });
});

describe("neighborSlice", () => {
  const board = boardOf([
    ["r1", 1900, 9],
    ["r2", 1850, 9],
    ["r3", 1800, 9],
    ["r4", 1750, 9],
    ["me", 1700, 9],
    ["r6", 1650, 9],
    ["r7", 1600, 9],
    ["r8", 1550, 9],
    ["r9", 1500, 9],
  ]);

  it("returns the player's row with up to N neighbors each side", () => {
    expect(neighborSlice(board, "me", 3).map((e) => e.entityId)).toEqual([
      "r2",
      "r3",
      "r4",
      "me",
      "r6",
      "r7",
      "r8",
    ]);
  });

  it("clips at the top and bottom of the board", () => {
    expect(neighborSlice(board, "r1", 3).map((e) => e.entityId)).toEqual(["r1", "r2", "r3", "r4"]);
    expect(neighborSlice(board, "r9", 3).map((e) => e.entityId)).toEqual(["r6", "r7", "r8", "r9"]);
  });

  it("returns an empty slice when the player is absent", () => {
    expect(neighborSlice(board, "ghost", 3)).toEqual([]);
  });
});
