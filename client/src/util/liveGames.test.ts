import { describe, expect, it } from "vitest";
import type { BroadcastInfo, GameKey } from "@gamenite/shared";
import {
  defaultLiveFilters,
  filterAndSortLiveGames,
  findLiveBroadcastForUser,
  type LiveGameFilters,
  type LiveGameRow,
} from "./liveGames.ts";

// A tiny row builder so each test only spells out the fields it cares about.
function row(opts: {
  id: string;
  gameKey: GameKey;
  elo: number | null;
  startedAt: string;
  players?: { username: string; isAi?: boolean }[];
}): LiveGameRow {
  return {
    broadcast: { broadcastId: opts.id } as BroadcastInfo,
    gameKey: opts.gameKey,
    players: (opts.players ?? []) as LiveGameRow["players"],
    elo: opts.elo,
    startedAt: opts.startedAt,
  };
}

function filters(overrides: Partial<LiveGameFilters>): LiveGameFilters {
  return { ...defaultLiveFilters, ...overrides };
}

const nimEarly = row({ id: "a", gameKey: "nim", elo: 1200, startedAt: "2026-06-01" });
const nimLate = row({ id: "b", gameKey: "nim", elo: 1800, startedAt: "2026-06-03" });
const checkers = row({ id: "c", gameKey: "checkers", elo: null, startedAt: "2026-06-02" });

describe("liveGames.filterAndSortLiveGames", () => {
  it("keeps everything and sorts newest-first by default", () => {
    const out = filterAndSortLiveGames([nimEarly, nimLate, checkers], defaultLiveFilters);
    expect(out.map((r) => r.broadcast.broadcastId)).toEqual(["b", "c", "a"]);
  });

  it("filters by selected game type", () => {
    const out = filterAndSortLiveGames([nimEarly, checkers], filters({ games: ["checkers"] }));
    expect(out).toHaveLength(1);
    expect(out[0].gameKey).toBe("checkers");
  });

  it("excludes unknown-Elo rows once the Elo band is narrowed", () => {
    const out = filterAndSortLiveGames(
      [nimEarly, checkers],
      filters({ minElo: 1000, maxElo: 1500 }),
    );
    expect(out.map((r) => r.broadcast.broadcastId)).toEqual(["a"]); // checkers (null Elo) dropped
  });

  it("drops rows outside the Elo band", () => {
    const out = filterAndSortLiveGames(
      [nimEarly, nimLate],
      filters({ minElo: 1000, maxElo: 1500 }),
    );
    expect(out.map((r) => r.broadcast.broadcastId)).toEqual(["a"]); // 1800 is above the band
  });

  it("sorts oldest-first", () => {
    const out = filterAndSortLiveGames([nimLate, nimEarly], filters({ sort: "oldest" }));
    expect(out.map((r) => r.broadcast.broadcastId)).toEqual(["a", "b"]);
  });

  it("sorts highest-elo first, unknown Elo last", () => {
    const out = filterAndSortLiveGames(
      [nimEarly, checkers, nimLate],
      filters({ sort: "highest-elo" }),
    );
    expect(out.map((r) => r.broadcast.broadcastId)).toEqual(["b", "a", "c"]);
  });

  it("sorts lowest-elo first, unknown Elo last", () => {
    const out = filterAndSortLiveGames(
      [nimLate, checkers, nimEarly],
      filters({ sort: "lowest-elo" }),
    );
    expect(out.map((r) => r.broadcast.broadcastId)).toEqual(["a", "b", "c"]);
  });
});

describe("liveGames.findLiveBroadcastForUser", () => {
  const rows = [
    row({ id: "x", gameKey: "nim", elo: null, startedAt: "1", players: [{ username: "ada" }] }),
    row({
      id: "y",
      gameKey: "nim",
      elo: null,
      startedAt: "2",
      players: [{ username: "bot", isAi: true }],
    }),
  ];

  it("returns the row where the user is a human player", () => {
    expect(findLiveBroadcastForUser(rows, "ada")?.broadcast.broadcastId).toBe("x");
  });

  it("ignores AI seats and returns null when there is no match", () => {
    expect(findLiveBroadcastForUser(rows, "bot")).toBeNull();
    expect(findLiveBroadcastForUser(rows, "nobody")).toBeNull();
  });
});
