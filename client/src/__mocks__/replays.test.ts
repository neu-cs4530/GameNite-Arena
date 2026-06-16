import { describe, expect, it } from "vitest";
import type { ReplayFilters } from "../util/types.ts";
import {
  featuredReplays,
  filterMockReplays,
  findMockReplay,
  incrementWatchCount,
  MOCK_REPLAYS,
} from "./replays.ts";

const base: ReplayFilters = {
  sort: "newest",
  games: [],
  participantType: "all",
  results: [],
  minElo: 0,
  maxElo: 9999,
  date: "all",
  minMoves: 0,
  maxMoves: 9999,
  participantSearch: "",
  ratedOnly: false,
  page: 1,
  pageSize: 200,
};

describe("filterMockReplays — basic", () => {
  it("returns all replays when no filters are applied", () => {
    const { replays, total } = filterMockReplays(base);
    expect(total).toBe(MOCK_REPLAYS.length);
    expect(replays).toHaveLength(MOCK_REPLAYS.length);
  });

  it("filters by game key", () => {
    const { replays } = filterMockReplays({ ...base, games: ["guess"] });
    expect(replays.every((r) => r.gameKey === "guess")).toBe(true);
    expect(replays.length).toBeGreaterThan(0);
  });

  it("pages results correctly", () => {
    const page1 = filterMockReplays({ ...base, pageSize: 5, page: 1 });
    const page2 = filterMockReplays({ ...base, pageSize: 5, page: 2 });
    expect(page1.replays).toHaveLength(5);
    expect(page2.replays).toHaveLength(5);
    expect(page1.replays[0].matchId).not.toBe(page2.replays[0].matchId);
  });
});

describe("filterMockReplays — participantType", () => {
  it("filters to human-only matches", () => {
    const { replays } = filterMockReplays({ ...base, participantType: "humans" });
    expect(replays.length).toBeGreaterThan(0);
    replays.forEach((r) => {
      const found = MOCK_REPLAYS.find((m) => m.matchId === r.matchId)!;
      expect(found.participants.every((p) => p.type === "human")).toBe(true);
    });
  });

  it("filters to AI-only matches", () => {
    const { replays } = filterMockReplays({ ...base, participantType: "ais" });
    expect(replays.length).toBeGreaterThan(0);
    replays.forEach((r) => {
      const found = MOCK_REPLAYS.find((m) => m.matchId === r.matchId)!;
      expect(found.participants.every((p) => p.type === "ai")).toBe(true);
    });
  });

  it("filters to mixed human-vs-AI matches", () => {
    const { replays } = filterMockReplays({ ...base, participantType: "mixed" });
    expect(replays.length).toBeGreaterThan(0);
    replays.forEach((r) => {
      const found = MOCK_REPLAYS.find((m) => m.matchId === r.matchId)!;
      const hasHuman = found.participants.some((p) => p.type === "human");
      const hasAi = found.participants.some((p) => p.type === "ai");
      expect(hasHuman && hasAi).toBe(true);
    });
  });
});

describe("filterMockReplays — results filter", () => {
  it("filters to draws", () => {
    const { replays } = filterMockReplays({ ...base, results: ["draws"] });
    replays.forEach((r) => {
      expect(r.result.outcome).toBe("draw");
    });
  });

  it("filters to abandoned matches", () => {
    const { replays } = filterMockReplays({ ...base, results: ["abandoned"] });
    replays.forEach((r) => {
      expect(r.result.outcome).toBe("abandoned");
    });
  });

  it("filters wins for a specific user", () => {
    const { replays } = filterMockReplays({ ...base, results: ["wins"], forUser: "user0" });
    replays.forEach((r) => {
      const found = MOCK_REPLAYS.find((m) => m.matchId === r.matchId)!;
      const winner = found.participants.find((p) => p.id === found.result.winnerId);
      expect(winner?.username).toBe("user0");
    });
  });

  it("filters losses for a specific user", () => {
    const { replays } = filterMockReplays({ ...base, results: ["losses"], forUser: "user0" });
    expect(replays.length).toBeGreaterThan(0);
    replays.forEach((r) => {
      const found = MOCK_REPLAYS.find((m) => m.matchId === r.matchId)!;
      const winner = found.participants.find((p) => p.id === found.result.winnerId);
      expect(winner?.username).not.toBe("user0");
    });
  });

  it("filters wins without a forUser (defaults all wins)", () => {
    const { replays } = filterMockReplays({ ...base, results: ["wins"] });
    replays.forEach((r) => {
      expect(r.result.outcome).toBe("win");
    });
  });
});

describe("filterMockReplays — ELO range", () => {
  it("filters out replays below minElo", () => {
    const { replays } = filterMockReplays({ ...base, minElo: 2000 });
    // every included replay must have at least one participant with elo >= 2000
    expect(replays.length).toBeGreaterThan(0);
  });

  it("filters out replays above maxElo", () => {
    const { replays } = filterMockReplays({ ...base, maxElo: 1100 });
    expect(replays.length).toBeGreaterThan(0);
  });
});

describe("filterMockReplays — date range", () => {
  it("filters to today", () => {
    const { replays } = filterMockReplays({ ...base, date: "today" });
    // Some replays were created hours ago, so at least one should survive
    expect(replays.length).toBeGreaterThan(0);
  });

  it("filters to the last week", () => {
    const { replays } = filterMockReplays({ ...base, date: "week" });
    expect(replays.length).toBeGreaterThan(0);
  });

  it("filters to the last month", () => {
    const { replays } = filterMockReplays({ ...base, date: "month" });
    expect(replays.length).toBeGreaterThan(0);
  });

  it("filters to the last year", () => {
    const { replays } = filterMockReplays({ ...base, date: "year" });
    expect(replays.length).toBeGreaterThan(0);
  });

  it("filters with a custom dateFrom (inclusive lower bound)", () => {
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { replays } = filterMockReplays({
      ...base,
      date: "custom",
      dateFrom: oneYearAgo,
    });
    expect(replays.length).toBeGreaterThan(0);
  });

  it("filters with a custom dateTo (exclusive upper bound)", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { replays } = filterMockReplays({
      ...base,
      date: "custom",
      dateTo: twoDaysAgo,
    });
    expect(replays.length).toBeGreaterThan(0);
  });
});

describe("filterMockReplays — misc filters", () => {
  it("filters by participant name search", () => {
    const { replays } = filterMockReplays({ ...base, participantSearch: "knight" });
    expect(replays.length).toBeGreaterThan(0);
  });

  it("participant search is case-insensitive", () => {
    const lower = filterMockReplays({ ...base, participantSearch: "rookiebot" });
    const upper = filterMockReplays({ ...base, participantSearch: "RookieBot" });
    expect(lower.total).toBe(upper.total);
  });

  it("filters rated-only matches", () => {
    const { replays } = filterMockReplays({ ...base, ratedOnly: true });
    replays.forEach((r) => {
      expect(r.rated).toBe(true);
    });
  });

  it("filters to a specific user's matches", () => {
    const { replays } = filterMockReplays({ ...base, forUser: "user1" });
    replays.forEach((r) => {
      const found = MOCK_REPLAYS.find((m) => m.matchId === r.matchId)!;
      expect(found.participants.some((p) => p.username === "user1")).toBe(true);
    });
  });

  it("applies the 'upsets' preset — only matches where the underdog won", () => {
    const { replays } = filterMockReplays({ ...base, preset: "upsets" });
    replays.forEach((r) => {
      const found = MOCK_REPLAYS.find((m) => m.matchId === r.matchId)!;
      const winner = found.participants.find((p) => p.id === found.result.winnerId);
      const loser = found.participants.find((p) => p.id !== found.result.winnerId);
      expect((winner?.ratingAtMatchTime ?? 0) + 200).toBeLessThan(loser?.ratingAtMatchTime ?? 0);
    });
  });

  it("applies move-count min/max", () => {
    const { replays } = filterMockReplays({ ...base, minMoves: 10, maxMoves: 12 });
    replays.forEach((r) => {
      expect(r.moveCount).toBeGreaterThanOrEqual(10);
      expect(r.moveCount).toBeLessThanOrEqual(12);
    });
  });
});

describe("filterMockReplays — sort orders", () => {
  it("sorts oldest first", () => {
    const { replays } = filterMockReplays({ ...base, sort: "oldest" });
    for (let i = 1; i < replays.length; i++) {
      expect(new Date(replays[i].completedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(replays[i - 1].completedAt).getTime(),
      );
    }
  });

  it("sorts by most-viewed", () => {
    const { replays } = filterMockReplays({ ...base, sort: "most-viewed" });
    for (let i = 1; i < replays.length; i++) {
      expect(replays[i].watchCount).toBeLessThanOrEqual(replays[i - 1].watchCount);
    }
  });

  it("sorts by fewest-viewed", () => {
    const { replays } = filterMockReplays({ ...base, sort: "fewest-viewed" });
    for (let i = 1; i < replays.length; i++) {
      expect(replays[i].watchCount).toBeGreaterThanOrEqual(replays[i - 1].watchCount);
    }
  });

  it("sorts by longest", () => {
    const { replays } = filterMockReplays({ ...base, sort: "longest" });
    for (let i = 1; i < replays.length; i++) {
      expect(replays[i].moveCount).toBeLessThanOrEqual(replays[i - 1].moveCount);
    }
  });

  it("sorts by shortest", () => {
    const { replays } = filterMockReplays({ ...base, sort: "shortest" });
    for (let i = 1; i < replays.length; i++) {
      expect(replays[i].moveCount).toBeGreaterThanOrEqual(replays[i - 1].moveCount);
    }
  });

  it("sorts by highest-elo", () => {
    const { replays } = filterMockReplays({ ...base, sort: "highest-elo" });
    expect(replays.length).toBeGreaterThan(0);
  });

  it("sorts by lowest-elo", () => {
    const { replays } = filterMockReplays({ ...base, sort: "lowest-elo" });
    expect(replays.length).toBeGreaterThan(0);
  });
});

describe("featuredReplays", () => {
  it("returns replays tagged for the strip, capped at 6", () => {
    const results = featuredReplays("most-viewed-today");
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(6);
  });

  it("works for each featured strip", () => {
    expect(featuredReplays("trending-week").length).toBeGreaterThan(0);
    expect(featuredReplays("notable-ai-vs-human").length).toBeGreaterThan(0);
    expect(featuredReplays("highest-rated-week").length).toBeGreaterThan(0);
  });
});

describe("findMockReplay", () => {
  it("finds a replay by its matchId", () => {
    const replay = findMockReplay("mock-match-1");
    expect(replay).not.toBeUndefined();
    expect(replay!.matchId).toBe("mock-match-1");
    expect(replay!.gameKey).toBe("nim");
  });

  it("returns undefined for an unknown matchId", () => {
    expect(findMockReplay("no-such-match")).toBeUndefined();
  });
});

describe("incrementWatchCount", () => {
  it("increments the watch count and returns the new value", () => {
    const before = MOCK_REPLAYS.find((r) => r.matchId === "mock-match-1")!.watchCount;
    const after = incrementWatchCount("mock-match-1");
    expect(after).toBe(before + 1);
  });

  it("returns 0 for an unknown matchId", () => {
    expect(incrementWatchCount("no-such-match")).toBe(0);
  });
});
