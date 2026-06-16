import { beforeEach, describe, expect, it } from "vitest";
import type { GameRecord } from "../../src/models.ts";
import { GameRepo } from "../../src/repository.ts";
import { migration } from "../../src/migrations/000_sprint1_arena_baseline.ts";

function oldGame(extras: Record<string, unknown> = {}): GameRecord {
  return {
    type: "nim",
    done: false,
    chat: "c1",
    createdAt: "2024-01-01T00:00:00Z",
    createdBy: "u1",
    ...extras,
  } as unknown as GameRecord;
}

describe("000_sprint1_arena_baseline — game backfill", () => {
  beforeEach(async () => {
    await GameRepo.clear();
  });

  it("adds rated=false and aiPlayers=[] when both are missing", async () => {
    await GameRepo.set("g1", oldGame());
    await migration.up();
    const g = (await GameRepo.find("g1")) as GameRecord;
    expect(g.rated).toBe(false);
    expect(g.aiPlayers).toEqual([]);
  });

  it("adds aiPlayers=[] when rated is defined but aiPlayers is missing", async () => {
    await GameRepo.set("g2", oldGame({ rated: true }));
    await migration.up();
    const g = (await GameRepo.find("g2")) as GameRecord;
    expect(g.aiPlayers).toEqual([]);
    expect(g.rated).toBe(true);
  });

  it("skips games that already have both rated and aiPlayers", async () => {
    await GameRepo.set("g3", oldGame({ rated: false, aiPlayers: [null] }));
    await migration.up();
    const g = (await GameRepo.find("g3")) as GameRecord;
    expect(g.aiPlayers).toEqual([null]);
  });

  it("preserves existing aiPlayers and players when rated is missing", async () => {
    await GameRepo.set("g4", oldGame({ aiPlayers: [null], players: ["u1"] }));
    await migration.up();
    const g = (await GameRepo.find("g4")) as GameRecord;
    expect(g.aiPlayers).toEqual([null]);
    expect(g.players).toEqual(["u1"]);
    expect(g.rated).toBe(false);
  });
});
