import { describe, expect, it } from "vitest";
import type { BroadcastInfo, SafeUserInfo } from "@gamenite/shared";
import {
  LIVE_ELO_MAX,
  LIVE_ELO_MIN,
  defaultLiveFilters,
  filterAndSortLiveGames,
  findLiveBroadcastForUser,
  type LiveGameRow,
} from "./liveGames.ts";

function user(username: string, isAi = false): SafeUserInfo {
  return { username, display: username.toUpperCase(), createdAt: new Date(0), isAi };
}

function row(over: Partial<LiveGameRow> & { broadcastId: string }): LiveGameRow {
  const broadcast: BroadcastInfo = {
    broadcastId: over.broadcastId,
    gameId: `game-${over.broadcastId}`,
    broadcasterId: "u-broadcaster",
    delaySec: 0,
    status: "live",
    chatChannel: `chat-${over.broadcastId}`,
    startedAt: over.startedAt ?? "2026-06-14T00:00:00.000Z",
  };
  return {
    broadcast,
    gameKey: over.gameKey ?? "nim",
    players: over.players ?? [user("alice"), user("bob")],
    elo: over.elo ?? null,
    startedAt: broadcast.startedAt,
  };
}

describe("filterAndSortLiveGames", () => {
  it("returns all rows newest-first by default", () => {
    const rows = [
      row({ broadcastId: "a", startedAt: "2026-06-14T01:00:00.000Z" }),
      row({ broadcastId: "b", startedAt: "2026-06-14T03:00:00.000Z" }),
      row({ broadcastId: "c", startedAt: "2026-06-14T02:00:00.000Z" }),
    ];
    const out = filterAndSortLiveGames(rows, defaultLiveFilters);
    expect(out.map((r) => r.broadcast.broadcastId)).toEqual(["b", "c", "a"]);
  });

  it("filters by selected games (empty = all)", () => {
    const rows = [
      row({ broadcastId: "nim1", gameKey: "nim" }),
      row({ broadcastId: "c4", gameKey: "connect4" }),
      row({ broadcastId: "ttt", gameKey: "tictactoe" }),
    ];
    const out = filterAndSortLiveGames(rows, {
      ...defaultLiveFilters,
      games: ["connect4", "tictactoe"],
    });
    expect(out.map((r) => r.broadcast.broadcastId).sort()).toEqual(["c4", "ttt"]);
  });

  it("applies the Elo range only when narrowed, excluding unknown-Elo rows", () => {
    const rows = [
      row({ broadcastId: "low", elo: 900 }),
      row({ broadcastId: "high", elo: 2000 }),
      row({ broadcastId: "unknown", elo: null }),
    ];
    // Default (full) range keeps everything, including unknown Elo.
    expect(filterAndSortLiveGames(rows, defaultLiveFilters)).toHaveLength(3);
    // Narrowed range keeps only known Elo within bounds.
    const narrowed = filterAndSortLiveGames(rows, {
      ...defaultLiveFilters,
      minElo: 1500,
      maxElo: LIVE_ELO_MAX,
    });
    expect(narrowed.map((r) => r.broadcast.broadcastId)).toEqual(["high"]);
  });

  it("sorts by Elo high-to-low with unknown Elo last", () => {
    const rows = [
      row({ broadcastId: "mid", elo: 1500 }),
      row({ broadcastId: "none", elo: null }),
      row({ broadcastId: "top", elo: 2100 }),
    ];
    const out = filterAndSortLiveGames(rows, { ...defaultLiveFilters, sort: "highest-elo" });
    expect(out.map((r) => r.broadcast.broadcastId)).toEqual(["top", "mid", "none"]);
  });
});

describe("findLiveBroadcastForUser", () => {
  it("finds a live game the user is playing in, by username", () => {
    const rows = [
      row({ broadcastId: "x", players: [user("carol"), user("dave")] }),
      row({ broadcastId: "y", players: [user("alice"), user("bob")] }),
    ];
    expect(findLiveBroadcastForUser(rows, "bob")?.broadcast.broadcastId).toBe("y");
  });

  it("returns null when the user is in no live game", () => {
    const rows = [row({ broadcastId: "x", players: [user("carol"), user("dave")] })];
    expect(findLiveBroadcastForUser(rows, "zzz")).toBeNull();
  });

  it("ignores AI seats when matching a human username", () => {
    const rows = [row({ broadcastId: "x", players: [user("ai:bot", true), user("erin")] })];
    expect(findLiveBroadcastForUser(rows, "ai:bot")).toBeNull();
    expect(findLiveBroadcastForUser(rows, "erin")?.broadcast.broadcastId).toBe("x");
  });
});

describe("constants", () => {
  it("exposes a sane default Elo band", () => {
    expect(LIVE_ELO_MIN).toBeLessThan(LIVE_ELO_MAX);
    expect(defaultLiveFilters.minElo).toBe(LIVE_ELO_MIN);
    expect(defaultLiveFilters.maxElo).toBe(LIVE_ELO_MAX);
  });
});
