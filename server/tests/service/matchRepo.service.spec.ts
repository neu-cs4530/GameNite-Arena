import { describe, expect, it, beforeEach } from "vitest";
// Tests for issue #21, story 3. Exercises the in-memory replay storage directly.

import { InMemoryMatchRepo } from "../../src/services/matchRepo.service.ts";
import { type ReplayRecord } from "@gamenite/shared";

describe("InMemoryMatchRepo.getReplay", () => {
  let database: InMemoryMatchRepo;

  const replay: ReplayRecord = {
    gameId: "game-001",
    gameType: "chess",
    players: ["P1", "P2"],
    outcome: "player_one_wins",
    startedAt: 1000,
    endedAt: 1010,
    moveHistory: [
      { userMove: 0, playedBy: "P1", moveNotation: "e4", playedAt: 1001 },
      { userMove: 1, playedBy: "P2", moveNotation: "e5", playedAt: 1002 },
    ],
  };

  beforeEach(() => {
    database = new InMemoryMatchRepo();
  });

  it("returns the stored replay for a known gameId", async () => {
    await database.saveReplay(replay);
    const loaded = await database.getReplay("game-001");
    expect(loaded).toEqual(replay);
  });

  it("returns null when no replay exists for that gameId", async () => {
    expect(await database.getReplay("ghost-game")).toBeNull();
  });

  it("hands back a copy so mutating the result doesn't change stored state", async () => {
    await database.saveReplay(replay);
    const loaded = (await database.getReplay("game-001"))!;
    loaded.moveHistory.push({ userMove: 2, playedBy: "P1", moveNotation: "Nf3", playedAt: 1003 });
    expect((await database.getReplay("game-001"))?.moveHistory).toHaveLength(2);
  });
});
