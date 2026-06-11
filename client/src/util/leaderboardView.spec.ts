import { describe, expect, it } from "vitest";
import {
  applyBoardView,
  findSelfEntry,
  formatWinRate,
  pageCount,
  pageSlice,
} from "./leaderboardView.ts";
import type { LeaderboardEntry } from "./types.ts";

function entry(overrides: Partial<LeaderboardEntry>): LeaderboardEntry {
  return {
    rank: 1,
    entityId: "id",
    entityType: "human",
    displayName: "Someone",
    username: "someone",
    rating: 1500,
    rd: 80,
    gamesPlayed: 10,
    provisional: false,
    wins: 5,
    winRate: 0.5,
    ...overrides,
  };
}

// Server order: by rating desc, ranks already assigned.
const BOARD: LeaderboardEntry[] = [
  entry({
    rank: 1,
    entityId: "alice",
    username: "alice",
    displayName: "Alice",
    rating: 1800,
    gamesPlayed: 10,
    wins: 8,
    winRate: 0.8,
  }),
  entry({
    rank: 2,
    entityId: "bob",
    username: "bob",
    displayName: "Bob",
    rating: 1600,
    gamesPlayed: 12,
    wins: 9,
    winRate: 0.75,
  }),
  entry({
    rank: 3,
    entityId: "model-1",
    username: undefined,
    entityType: "ai",
    displayName: "CaraBot",
    rating: 1500,
    gamesPlayed: 9,
    wins: 9,
    winRate: 1,
  }),
  entry({
    rank: 4,
    entityId: "dee",
    username: "dee",
    displayName: "Dee",
    rating: 1400,
    gamesPlayed: 0,
    wins: 0,
    winRate: 0,
  }),
];

describe("applyBoardView", () => {
  it("keeps the server (rating) order for the rating sort", () => {
    const result = applyBoardView(BOARD, { sort: "rating", search: "" });
    expect(result.map((e) => e.entityId)).toEqual(["alice", "bob", "model-1", "dee"]);
  });

  it("sorts by win rate descending", () => {
    const result = applyBoardView(BOARD, { sort: "winRate", search: "" });
    expect(result.map((e) => e.entityId)).toEqual(["model-1", "alice", "bob", "dee"]);
  });

  it("sorts by wins descending, breaking ties by server rank", () => {
    // bob (rank 2) and CaraBot (rank 3) both have 9 wins.
    const result = applyBoardView(BOARD, { sort: "wins", search: "" });
    expect(result.map((e) => e.entityId)).toEqual(["bob", "model-1", "alice", "dee"]);
  });

  it("sorts by games played descending", () => {
    const result = applyBoardView(BOARD, { sort: "gamesPlayed", search: "" });
    expect(result.map((e) => e.entityId)).toEqual(["bob", "alice", "model-1", "dee"]);
  });

  it("filters by display name, case-insensitively", () => {
    const result = applyBoardView(BOARD, { sort: "rating", search: "  ALI " });
    expect(result.map((e) => e.entityId)).toEqual(["alice"]);
  });

  it("also matches against the username", () => {
    const renamed = [entry({ entityId: "x", username: "zorro", displayName: "The Fox" })];
    const result = applyBoardView(renamed, { sort: "rating", search: "zor" });
    expect(result).toHaveLength(1);
  });

  it("composes search and sort without mutating the input", () => {
    const before = BOARD.map((e) => e.entityId);
    const result = applyBoardView(BOARD, { sort: "wins", search: "b" });
    // "b" matches Bob, CaraBot ("b" in displayName) — sorted by wins.
    expect(result.map((e) => e.entityId)).toEqual(["bob", "model-1"]);
    expect(BOARD.map((e) => e.entityId)).toEqual(before);
  });
});

describe("findSelfEntry", () => {
  it("finds the signed-in user's row by username", () => {
    expect(findSelfEntry(BOARD, "bob")?.entityId).toBe("bob");
  });

  it("only matches human rows", () => {
    const tricky = [entry({ entityType: "ai", username: undefined, displayName: "bob" })];
    expect(findSelfEntry(tricky, "bob")).toBeNull();
  });

  it("returns null when the user is not on the board", () => {
    expect(findSelfEntry(BOARD, "nobody")).toBeNull();
  });
});

describe("formatWinRate", () => {
  it("renders fractions as whole percentages", () => {
    expect(formatWinRate(0.75)).toBe("75%");
    expect(formatWinRate(0)).toBe("0%");
    expect(formatWinRate(1)).toBe("100%");
  });

  it("rounds to the nearest whole percent", () => {
    expect(formatWinRate(2 / 3)).toBe("67%");
  });
});

describe("pagination helpers", () => {
  it("slices one page of entries", () => {
    expect(pageSlice(BOARD, 1, 2).map((e) => e.entityId)).toEqual(["alice", "bob"]);
    expect(pageSlice(BOARD, 2, 2).map((e) => e.entityId)).toEqual(["model-1", "dee"]);
  });

  it("computes the number of pages, with a minimum of one", () => {
    expect(pageCount(4, 2)).toBe(2);
    expect(pageCount(5, 2)).toBe(3);
    expect(pageCount(0, 50)).toBe(1);
  });
});
