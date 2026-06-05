import { describe, expect, it, beforeEach } from "vitest";
// Tests for issue #21. Uses the in-memory repository so there's no DB dependency.

import { MatchRecorder } from "../../src/services/matchRecorder.service.ts";
import { InMemoryMatchRepo } from "../../src/services/matchRepo.service.ts";

describe("MatchRecorder", () => {
  let database: InMemoryMatchRepo;
  let fakeTime: number;
  let recorder: MatchRecorder;

  const getCurrentTime = () => ++fakeTime;

  beforeEach(() => {
    database = new InMemoryMatchRepo();
    fakeTime = 1000;
    recorder = new MatchRecorder({ database, getCurrentTime });
  });

  const openGame = () =>
    recorder.startMatch({
      gameId: "game-001",
      gameType: "chess",
      players: ["P1", "P2"],
    });

  it("should write the match row as soon as the game starts", async () => {
    await openGame();
    const savedRecord = database.matchRecords.get("game-001");
    expect(savedRecord).toBeDefined();
    expect(savedRecord?.players).toEqual(["P1", "P2"]);
    expect(savedRecord?.startedAt).toBeGreaterThan(0);
    expect(savedRecord?.totalMoves).toBe(0);
    expect(recorder.isRecording("game-001")).toBe(true);
  });

  it("should refuse to start the same game twice", async () => {
    await openGame();
    await expect(openGame()).rejects.toThrow(/already being recorded/);
  });

  it("persists every move in order with sequential userMove indices", async () => {
    await openGame();
    await recorder.recordMove("game-001", { playedBy: "P1", moveNotation: "e4" });
    await recorder.recordMove("game-001", { playedBy: "P2", moveNotation: "e5" });
    await recorder.recordMove("game-001", { playedBy: "P1", moveNotation: "Nf3" });

    const savedMoves = database.movesByGame.get("game-001")!;
    expect(savedMoves).toHaveLength(3);
    expect(savedMoves.map((m) => m.userMove)).toEqual([0, 1, 2]);
    expect(savedMoves.map((m) => m.moveNotation)).toEqual(["e4", "e5", "Nf3"]);
    expect(savedMoves.every((m) => m.playedAt > 0)).toBe(true);
  });

  it("should accept a caller-supplied userMove index when it matches", async () => {
    await openGame();
    await recorder.recordMove("game-001", { userMove: 0, playedBy: "P1", moveNotation: "e4" });
    await recorder.recordMove("game-001", { userMove: 1, playedBy: "P2", moveNotation: "e5" });
    expect(database.movesByGame.get("game-001")).toHaveLength(2);
  });

  it("should reject an out-of-order or duplicate move", async () => {
    await openGame();
    await recorder.recordMove("game-001", { playedBy: "P1", moveNotation: "e4" });
    await expect(
      recorder.recordMove("game-001", { userMove: 0, playedBy: "P2", moveNotation: "Illegal" }),
    ).rejects.toThrow(/Out-of-order/);
  });

  it("should reject moves for a game that was never started", async () => {
    await expect(
      recorder.recordMove("ghost-game", { playedBy: "P1", moveNotation: "e4" }),
    ).rejects.toThrow(/isn't active/);
  });

  it("should finalize the match and save a complete replay when the game ends", async () => {
    await openGame();
    await recorder.recordMove("game-001", { playedBy: "P1", moveNotation: "e4" });
    await recorder.recordMove("game-001", { playedBy: "P2", moveNotation: "e5" });

    const replayRecord = await recorder.endMatch("game-001", "player_one_wins");

    expect(replayRecord.outcome).toBe("player_one_wins");
    expect(replayRecord.moveHistory).toHaveLength(2);
    expect(replayRecord.endedAt).toBeGreaterThan(replayRecord.startedAt);

    const savedRecord = database.matchRecords.get("game-001")!;
    expect(savedRecord.outcome).toBe("player_one_wins");
    expect(savedRecord.totalMoves).toBe(2);
    expect(savedRecord.endedAt).toBeDefined();

    expect(database.replaysByGame.get("game-001")?.moveHistory).toHaveLength(2);
    expect(recorder.isRecording("game-001")).toBe(false);
  });

  it("should reject ending a game that was never started", async () => {
    await expect(recorder.endMatch("nope", "draw")).rejects.toThrow(/isn't active/);
  });
});
