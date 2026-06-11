import { describe, expect, it } from "vitest";
import type { GameInfo } from "@gamenite/shared";
import {
  inProgressGamesFor,
  poolSize,
  queueTileLabel,
  type QueueCounts,
} from "./matchmakingService.ts";

/**
 * The portal tiles and queue page render straight from these mappers, and
 * the counts endpoint is polled — so every mapper must be total over
 * missing/zero data or a single absent game key blanks the whole grid.
 */

const counts: QueueCounts = {
  nim: { rated: 3, unrated: 1 },
  guess: { rated: 0, unrated: 0 },
};

describe("queueTileLabel", () => {
  it("renders both pools for a game", () => {
    expect(queueTileLabel(counts.nim)).toBe("3 in ranked queue · 1 casual");
  });

  it("renders zeros rather than hiding an empty queue", () => {
    expect(queueTileLabel(counts.guess)).toBe("0 in ranked queue · 0 casual");
  });

  it("treats a missing game entry as an empty queue", () => {
    expect(queueTileLabel(undefined)).toBe("0 in ranked queue · 0 casual");
  });
});

describe("poolSize", () => {
  it("selects the rated pool", () => {
    expect(poolSize(counts, "nim", true)).toBe(3);
  });

  it("selects the casual pool", () => {
    expect(poolSize(counts, "nim", false)).toBe(1);
  });

  it("is zero for a game the poll has not reported yet", () => {
    expect(poolSize({}, "nim", true)).toBe(0);
  });
});

/** Minimal GameInfo — only the fields the filter reads are load-bearing. */
function game(id: string, status: GameInfo["status"], usernames: string[]): GameInfo {
  const user = (username: string) => ({
    username,
    display: username,
    createdAt: new Date("2026-06-01T00:00:00Z"),
  });
  return {
    gameId: id,
    type: "nim",
    status,
    chat: `chat-${id}`,
    players: usernames.map(user),
    createdAt: new Date("2026-06-09T00:00:00Z"),
    createdBy: user(usernames[0] ?? "someone"),
    minPlayers: 2,
  };
}

describe("inProgressGamesFor", () => {
  const games = [
    game("g-active-mine", "active", ["zara", "rival"]),
    game("g-waiting-mine", "waiting", ["zara"]),
    game("g-done-mine", "done", ["zara", "rival"]),
    game("g-active-theirs", "active", ["rival", "other"]),
  ];

  it("keeps only unfinished games where the user is a player", () => {
    expect(inProgressGamesFor(games, "zara").map((g) => g.gameId)).toEqual([
      "g-active-mine",
      "g-waiting-mine",
    ]);
  });

  it("returns nothing for a spectator", () => {
    expect(inProgressGamesFor(games, "stranger")).toEqual([]);
  });

  it("handles an empty list", () => {
    expect(inProgressGamesFor([], "zara")).toEqual([]);
  });
});
