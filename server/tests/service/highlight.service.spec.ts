import { beforeEach, describe, expect, it } from "vitest";
import type { GameRecord } from "../../src/models.ts";
import { GameRepo } from "../../src/repository.ts";
import { getUserByUsername } from "../../src/services/auth.service.ts";
import {
  createHighlight,
  HighlightTargetNotFound,
  listHighlightsForUser,
} from "../../src/services/highlight.service.ts";
import type { UserWithId } from "../../src/types.ts";

let user0: UserWithId;
let user1: UserWithId;

beforeEach(async () => {
  const u0 = await getUserByUsername("user0");
  const u1 = await getUserByUsername("user1");
  if (!u0 || !u1) throw new Error("seeded users missing");
  user0 = u0;
  user1 = u1;
});

function gameWithPlayers(players: string[]): GameRecord {
  return {
    type: "nim",
    state: { remaining: 5, nextPlayer: 0 },
    done: false,
    chat: "chat-x",
    players,
    aiPlayers: [],
    rated: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    createdBy: players[0],
  };
}

describe("highlight.service.createHighlight", () => {
  it("throws when neither a broadcast nor a game is specified", async () => {
    await expect(createHighlight(user0, {}, new Date())).rejects.toBeInstanceOf(
      HighlightTargetNotFound,
    );
  });

  it("throws HighlightTargetNotFound for an unknown game id", async () => {
    await expect(createHighlight(user0, { gameId: "ghost" }, new Date())).rejects.toBeInstanceOf(
      HighlightTargetNotFound,
    );
  });

  it("refuses to highlight a game the user isn't playing in", async () => {
    await GameRepo.set("g-other", gameWithPlayers([user1.userId]));
    await expect(createHighlight(user0, { gameId: "g-other" }, new Date())).rejects.toThrow(
      /only a player/i,
    );
  });

  it("saves a highlight for a game the user plays in", async () => {
    await GameRepo.set("g-mine", gameWithPlayers([user0.userId]));
    const highlight = await createHighlight(
      user0,
      { gameId: "g-mine", movesBack: 3, note: "nice" },
      new Date("2026-06-02T00:00:00Z"),
    );
    expect(highlight.gameId).toBe("g-mine");
    expect(highlight.movesBack).toBe(3);
    expect(highlight.note).toBe("nice");
  });
});

describe("highlight.service.listHighlightsForUser", () => {
  it("returns only the user's own highlights, newest first", async () => {
    await GameRepo.set("g-mine", gameWithPlayers([user0.userId]));
    await createHighlight(user0, { gameId: "g-mine" }, new Date("2026-06-01T00:00:00Z"));
    await createHighlight(user0, { gameId: "g-mine" }, new Date("2026-06-03T00:00:00Z"));

    const mine = await listHighlightsForUser(user0.userId);
    expect(mine).toHaveLength(2);
    // newest captured first
    expect(mine[0].capturedAt >= mine[1].capturedAt).toBe(true);
    expect(await listHighlightsForUser(user1.userId)).toHaveLength(0);
  });
});
