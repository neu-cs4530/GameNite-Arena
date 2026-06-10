import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ReplayDetail, ReplayListQuery } from "@gamenite/shared";
import {
  InMemoryReplayStore,
  getReplay,
  listReplays,
  makeDefaultStore,
  recordWatch,
  replaceStoreForTests,
} from "../../src/services/replay.service.ts";

/* ---------------------------------------------------------------------------
 * Test fixture
 * - Two human-vs-human matches (varies game, rating, moves, date, outcome)
 * - One AI-vs-AI match
 * - One mixed human-vs-AI match
 * Lets us assert each filter/sort dimension in isolation.
 * ----------------------------------------------------------------------- */

function makeReplay(overrides: Partial<ReplayDetail>): ReplayDetail {
  const base: ReplayDetail = {
    matchId: "test-match",
    gameId: "test-game",
    gameKey: "tictactoe",
    rated: true,
    completedAt: "2026-05-01T00:00:00.000Z",
    moveCount: 5,
    watchCount: 10,
    participants: [
      {
        id: "u-a",
        type: "human",
        displayName: "Alice",
        username: "alice",
        ratingAtMatchTime: 1500,
      },
      {
        id: "u-b",
        type: "human",
        displayName: "Bob",
        username: "bob",
        ratingAtMatchTime: 1600,
      },
    ],
    result: { outcome: "win", winnerId: "u-a" },
    moves: [],
  };
  return { ...base, ...overrides };
}

const FIXTURE: ReplayDetail[] = [
  makeReplay({
    matchId: "m1-hh-tictactoe",
    gameKey: "tictactoe",
    rated: true,
    completedAt: "2026-05-25T00:00:00.000Z",
    moveCount: 7,
    watchCount: 100,
    result: { outcome: "win", winnerId: "u-a" },
  }),
  makeReplay({
    matchId: "m2-hh-checkers",
    gameKey: "checkers",
    rated: true,
    completedAt: "2026-05-10T00:00:00.000Z",
    moveCount: 50,
    watchCount: 5,
    participants: [
      {
        id: "u-c",
        type: "human",
        displayName: "Carol",
        username: "carol",
        ratingAtMatchTime: 1200,
      },
      { id: "u-d", type: "human", displayName: "Dave", username: "dave", ratingAtMatchTime: 1300 },
    ],
    result: { outcome: "draw" },
  }),
  makeReplay({
    matchId: "m3-aa-connect4",
    gameKey: "connect4",
    rated: false,
    completedAt: "2026-05-20T00:00:00.000Z",
    moveCount: 30,
    watchCount: 50,
    participants: [
      { id: "ai-1", type: "ai", displayName: "AlphaBot", ratingAtMatchTime: 2000 },
      { id: "ai-2", type: "ai", displayName: "BetaBot", ratingAtMatchTime: 1900 },
    ],
    result: { outcome: "win", winnerId: "ai-1" },
  }),
  makeReplay({
    matchId: "m4-mixed-nim",
    gameKey: "nim",
    rated: true,
    completedAt: "2026-05-15T00:00:00.000Z",
    moveCount: 10,
    watchCount: 25,
    participants: [
      {
        id: "u-a",
        type: "human",
        displayName: "Alice",
        username: "alice",
        ratingAtMatchTime: 1500,
      },
      { id: "ai-3", type: "ai", displayName: "GammaBot", ratingAtMatchTime: 1700 },
    ],
    result: { outcome: "abandoned" },
  }),
];

const defaults: ReplayListQuery = { page: 1, pageSize: 24 };

beforeEach(() => {
  replaceStoreForTests(new InMemoryReplayStore(FIXTURE));
});

afterEach(() => {
  // Restore the production store stack.
  replaceStoreForTests(makeDefaultStore());
});

describe("getReplay", () => {
  it("returns the detail for a known id", async () => {
    const result = await getReplay("m1-hh-tictactoe");
    expect(result).not.toBeNull();
    expect(result?.matchId).toBe("m1-hh-tictactoe");
    expect(result?.gameKey).toBe("tictactoe");
  });

  it("returns null for an unknown id", async () => {
    const result = await getReplay("does-not-exist");
    expect(result).toBeNull();
  });

  it("returns a clone — mutating the result must not affect the store", async () => {
    const first = await getReplay("m1-hh-tictactoe");
    expect(first).not.toBeNull();
    first!.watchCount = 999;
    const second = await getReplay("m1-hh-tictactoe");
    expect(second?.watchCount).toBe(100);
  });
});

describe("recordWatch", () => {
  it("increments the watch count and returns the new value", async () => {
    const result = await recordWatch("m1-hh-tictactoe");
    expect(result).toEqual({ matchId: "m1-hh-tictactoe", watchCount: 101 });
  });

  it("increments are persistent across calls", async () => {
    await recordWatch("m1-hh-tictactoe");
    const second = await recordWatch("m1-hh-tictactoe");
    expect(second?.watchCount).toBe(102);
  });

  it("returns null for an unknown id", async () => {
    const result = await recordWatch("ghost");
    expect(result).toBeNull();
  });
});

describe("listReplays — pagination", () => {
  it("returns the whole fixture with default page/size", async () => {
    const page = await listReplays(defaults);
    expect(page.total).toBe(4);
    expect(page.replays).toHaveLength(4);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(24);
  });

  it("respects pageSize and reports total separately", async () => {
    const page = await listReplays({ page: 1, pageSize: 2 });
    expect(page.replays).toHaveLength(2);
    expect(page.total).toBe(4);
  });

  it("returns later pages correctly", async () => {
    const p2 = await listReplays({ page: 2, pageSize: 2 });
    expect(p2.replays).toHaveLength(2);
    expect(p2.total).toBe(4);
    expect(p2.page).toBe(2);
  });

  it("returns empty replays past the last page but keeps the total accurate", async () => {
    const empty = await listReplays({ page: 99, pageSize: 2 });
    expect(empty.replays).toHaveLength(0);
    expect(empty.total).toBe(4);
  });

  it("clamps a non-positive page to 1", async () => {
    const page = await listReplays({ page: 0, pageSize: 2 });
    expect(page.page).toBe(1);
    expect(page.replays).toHaveLength(2);
  });

  it("caps oversize pageSize at 100", async () => {
    const page = await listReplays({ page: 1, pageSize: 9999 });
    expect(page.pageSize).toBe(100);
    expect(page.replays).toHaveLength(4);
  });
});

describe("listReplays — filters", () => {
  it("filters by games", async () => {
    const page = await listReplays({ ...defaults, games: ["tictactoe"] });
    expect(page.replays.map((r) => r.matchId)).toEqual(["m1-hh-tictactoe"]);
  });

  it("filters by multiple games (union)", async () => {
    const page = await listReplays({ ...defaults, games: ["tictactoe", "checkers"] });
    expect(page.replays.map((r) => r.matchId).sort()).toEqual([
      "m1-hh-tictactoe",
      "m2-hh-checkers",
    ]);
  });

  it("filters by ratedOnly", async () => {
    const page = await listReplays({ ...defaults, ratedOnly: true });
    expect(page.replays.map((r) => r.matchId)).not.toContain("m3-aa-connect4");
    expect(page.total).toBe(3);
  });

  it("filters by participantType=humans (no AI players)", async () => {
    const page = await listReplays({ ...defaults, participantType: "humans" });
    const ids = page.replays.map((r) => r.matchId);
    expect(ids).toContain("m1-hh-tictactoe");
    expect(ids).toContain("m2-hh-checkers");
    expect(ids).not.toContain("m3-aa-connect4");
    expect(ids).not.toContain("m4-mixed-nim");
  });

  it("filters by participantType=ais (no human players)", async () => {
    const page = await listReplays({ ...defaults, participantType: "ais" });
    expect(page.replays.map((r) => r.matchId)).toEqual(["m3-aa-connect4"]);
  });

  it("filters by participantType=mixed (both human and AI)", async () => {
    const page = await listReplays({ ...defaults, participantType: "mixed" });
    expect(page.replays.map((r) => r.matchId)).toEqual(["m4-mixed-nim"]);
  });

  it("filters by minMoves and maxMoves", async () => {
    const page = await listReplays({ ...defaults, minMoves: 10, maxMoves: 40 });
    const ids = page.replays.map((r) => r.matchId);
    expect(ids).toContain("m3-aa-connect4"); // 30 moves
    expect(ids).toContain("m4-mixed-nim"); // 10 moves
    expect(ids).not.toContain("m1-hh-tictactoe"); // 7 moves
    expect(ids).not.toContain("m2-hh-checkers"); // 50 moves
  });

  it("filters by results=wins", async () => {
    const page = await listReplays({ ...defaults, results: ["wins"] });
    const ids = page.replays.map((r) => r.matchId);
    expect(ids).toContain("m1-hh-tictactoe");
    expect(ids).toContain("m3-aa-connect4");
    expect(ids).not.toContain("m2-hh-checkers");
    expect(ids).not.toContain("m4-mixed-nim");
  });

  it("filters by results=draws", async () => {
    const page = await listReplays({ ...defaults, results: ["draws"] });
    expect(page.replays.map((r) => r.matchId)).toEqual(["m2-hh-checkers"]);
  });

  it("filters by results=abandoned", async () => {
    const page = await listReplays({ ...defaults, results: ["abandoned"] });
    expect(page.replays.map((r) => r.matchId)).toEqual(["m4-mixed-nim"]);
  });

  it("filters by participantSearch (case-insensitive substring)", async () => {
    const page = await listReplays({ ...defaults, participantSearch: "ALICE" });
    const ids = page.replays.map((r) => r.matchId);
    expect(ids).toContain("m1-hh-tictactoe");
    expect(ids).toContain("m4-mixed-nim");
    expect(ids).not.toContain("m2-hh-checkers");
  });

  it("filters by forUser (only matches the user participated in)", async () => {
    const page = await listReplays({ ...defaults, forUser: "alice" });
    expect(page.replays.map((r) => r.matchId).sort()).toEqual(["m1-hh-tictactoe", "m4-mixed-nim"]);
  });

  it("filters by minElo / maxElo (average of participant ratings)", async () => {
    // m1: avg 1550, m2: avg 1250, m3: avg 1950, m4: avg 1600
    const page = await listReplays({ ...defaults, minElo: 1500, maxElo: 1800 });
    expect(page.replays.map((r) => r.matchId).sort()).toEqual(["m1-hh-tictactoe", "m4-mixed-nim"]);
  });

  it("filters by date range", async () => {
    const page = await listReplays({
      ...defaults,
      dateFrom: "2026-05-15",
      dateTo: "2026-05-25T23:59:59.000Z",
    });
    expect(page.replays.map((r) => r.matchId).sort()).toEqual([
      "m1-hh-tictactoe",
      "m3-aa-connect4",
      "m4-mixed-nim",
    ]);
  });

  it("combines multiple filters with AND semantics", async () => {
    const page = await listReplays({
      ...defaults,
      games: ["nim", "tictactoe"],
      participantSearch: "alice",
    });
    expect(page.replays.map((r) => r.matchId).sort()).toEqual(["m1-hh-tictactoe", "m4-mixed-nim"]);
  });
});

describe("listReplays — sort", () => {
  it("newest first by default", async () => {
    const page = await listReplays(defaults);
    expect(page.replays.map((r) => r.completedAt)).toEqual([
      "2026-05-25T00:00:00.000Z",
      "2026-05-20T00:00:00.000Z",
      "2026-05-15T00:00:00.000Z",
      "2026-05-10T00:00:00.000Z",
    ]);
  });

  it("oldest first", async () => {
    const page = await listReplays({ ...defaults, sort: "oldest" });
    expect(page.replays[0].matchId).toBe("m2-hh-checkers");
    expect(page.replays[page.replays.length - 1].matchId).toBe("m1-hh-tictactoe");
  });

  it("most-viewed first", async () => {
    const page = await listReplays({ ...defaults, sort: "most-viewed" });
    expect(page.replays.map((r) => r.watchCount)).toEqual([100, 50, 25, 5]);
  });

  it("fewest-viewed first", async () => {
    const page = await listReplays({ ...defaults, sort: "fewest-viewed" });
    expect(page.replays.map((r) => r.watchCount)).toEqual([5, 25, 50, 100]);
  });

  it("longest first by move count", async () => {
    const page = await listReplays({ ...defaults, sort: "longest" });
    expect(page.replays.map((r) => r.moveCount)).toEqual([50, 30, 10, 7]);
  });

  it("shortest first by move count", async () => {
    const page = await listReplays({ ...defaults, sort: "shortest" });
    expect(page.replays.map((r) => r.moveCount)).toEqual([7, 10, 30, 50]);
  });

  it("highest-elo first by avg participant rating", async () => {
    const page = await listReplays({ ...defaults, sort: "highest-elo" });
    // averages: m3=1950, m4=1600, m1=1550, m2=1250
    expect(page.replays.map((r) => r.matchId)).toEqual([
      "m3-aa-connect4",
      "m4-mixed-nim",
      "m1-hh-tictactoe",
      "m2-hh-checkers",
    ]);
  });

  it("lowest-elo first by avg participant rating", async () => {
    const page = await listReplays({ ...defaults, sort: "lowest-elo" });
    expect(page.replays.map((r) => r.matchId)).toEqual([
      "m2-hh-checkers",
      "m1-hh-tictactoe",
      "m4-mixed-nim",
      "m3-aa-connect4",
    ]);
  });
});

describe("listReplays — list summary projection", () => {
  it("strips heavyweight fields (gameId, moves, initialState) from the summary", async () => {
    const page = await listReplays({ ...defaults, games: ["tictactoe"] });
    const r = page.replays[0];
    // ReplaySummary keys only — no detail-only fields.
    expect(r).not.toHaveProperty("gameId");
    expect(r).not.toHaveProperty("moves");
    expect(r).not.toHaveProperty("initialState");
    expect(r).toHaveProperty("matchId");
    expect(r).toHaveProperty("participants");
    expect(r).toHaveProperty("result");
  });
});
