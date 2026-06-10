import { beforeEach, describe, expect, it } from "vitest";
import type { GameRecord } from "../../src/models.ts";
import { MatchRecorder } from "../../src/services/matchRecorder.service.ts";
import { InMemoryMatchRepo } from "../../src/services/matchRepo.service.ts";

/* ---------------------------------------------------------------------------
 * Tests for the rewritten MatchRecorder.
 * The recorder owns lifecycle (first-move-starts-tracking, done-finalizes)
 * so the spec verifies it indirectly through captureMove(...) calls — there
 * is no longer a public startMatch / recordMove / endMatch API.
 * ----------------------------------------------------------------------- */

const baseGame: GameRecord = {
  type: "nim",
  done: false,
  chat: "chat-001",
  players: ["u-alice", "u-bob"],
  aiPlayers: [],
  rated: true,
  createdAt: "2026-06-01T00:00:00.000Z",
  createdBy: "u-alice",
};

describe("MatchRecorder", () => {
  let database: InMemoryMatchRepo;
  let fakeTime: number;
  let recorder: MatchRecorder;

  const getCurrentTime = () => ++fakeTime;
  const resolveDisplayName = (id: string) =>
    Promise.resolve(
      {
        "u-alice": "Alice",
        "u-bob": "Bob",
        "u-carol": "Carol",
      }[id] ?? id,
    );

  beforeEach(() => {
    database = new InMemoryMatchRepo();
    fakeTime = 1_700_000_000_000;
    recorder = new MatchRecorder({ database, resolveDisplayName, getCurrentTime });
  });

  it("starts tracking on the first captureMove", async () => {
    await recorder.captureMove(baseGame, "game-001", "u-alice", { take: 3 }, false);
    expect(recorder.isRecording("game-001")).toBe(true);
    // Nothing should be persisted yet — single-write fires only on done.
    expect(database.matches.size).toBe(0);
  });

  it("accumulates every move in order", async () => {
    await recorder.captureMove(baseGame, "game-001", "u-alice", { take: 3 }, false);
    await recorder.captureMove(baseGame, "game-001", "u-bob", { take: 2 }, false);
    await recorder.captureMove(baseGame, "game-001", "u-alice", { take: 1 }, true);

    const stored = database.matches.get("game-001");
    expect(stored).toBeDefined();
    expect(stored!.moves).toHaveLength(3);
    expect(stored!.moves.map((m) => m.actor)).toEqual(["u-alice", "u-bob", "u-alice"]);
    expect(stored!.moves.map((m) => m.move)).toEqual([{ take: 3 }, { take: 2 }, { take: 1 }]);
  });

  it("persists the complete MatchRecord exactly once when done flips true", async () => {
    await recorder.captureMove(baseGame, "game-001", "u-alice", { take: 1 }, false);
    expect(database.matches.size).toBe(0);

    await recorder.captureMove(baseGame, "game-001", "u-bob", { take: 1 }, true);
    expect(database.matches.size).toBe(1);

    const stored = database.matches.get("game-001")!;
    expect(stored.gameId).toBe("game-001");
    expect(stored.gameKey).toBe("nim");
    expect(stored.rated).toBe(true);
    expect(stored.result).toEqual({ outcome: "win" });
    expect(stored.createdAt).toBeDefined();
    expect(stored.completedAt).toBeDefined();
    expect(stored.completedAt >= stored.createdAt).toBe(true);
  });

  it("resolves human participants via the injected resolver", async () => {
    await recorder.captureMove(baseGame, "game-001", "u-alice", { take: 1 }, true);
    const stored = database.matches.get("game-001")!;
    expect(stored.participants).toEqual([
      { id: "u-alice", type: "human", displayName: "Alice" },
      { id: "u-bob", type: "human", displayName: "Bob" },
    ]);
  });

  it("includes AI participants with their embedded displayName (no resolver lookup)", async () => {
    const mixedGame: GameRecord = {
      ...baseGame,
      players: ["u-alice"],
      aiPlayers: [{ deploymentId: "dep-1", modelId: "model-1", displayName: "RookieBot" }],
    };
    await recorder.captureMove(mixedGame, "game-002", "u-alice", { take: 2 }, true);
    const stored = database.matches.get("game-002")!;
    expect(stored.participants).toEqual([
      { id: "u-alice", type: "human", displayName: "Alice" },
      { id: "model-1", type: "ai", displayName: "RookieBot" },
    ]);
  });

  it("clears in-progress state after persisting", async () => {
    await recorder.captureMove(baseGame, "game-001", "u-alice", { take: 1 }, true);
    expect(recorder.isRecording("game-001")).toBe(false);
  });

  it("tracks multiple games independently", async () => {
    const game2: GameRecord = { ...baseGame, players: ["u-alice", "u-carol"] };
    await recorder.captureMove(baseGame, "game-A", "u-alice", { take: 3 }, false);
    await recorder.captureMove(game2, "game-B", "u-alice", { take: 2 }, false);
    await recorder.captureMove(baseGame, "game-A", "u-bob", { take: 2 }, true);

    expect(recorder.isRecording("game-A")).toBe(false);
    expect(recorder.isRecording("game-B")).toBe(true);
    expect(database.matches.has("game-A")).toBe(true);
    expect(database.matches.has("game-B")).toBe(false);
  });

  it("handles a single-move game (done=true on the very first capture)", async () => {
    await recorder.captureMove(baseGame, "game-001", "u-alice", { take: 7 }, true);
    const stored = database.matches.get("game-001");
    expect(stored).toBeDefined();
    expect(stored!.moves).toHaveLength(1);
    expect(stored!.result.outcome).toBe("win");
  });

  it("falls back to the userId when the display-name resolver returns it as-is", async () => {
    const fallbackRecorder = new MatchRecorder({
      database,
      resolveDisplayName: (id) => Promise.resolve(id),
      getCurrentTime,
    });
    await fallbackRecorder.captureMove(baseGame, "game-001", "u-alice", { take: 1 }, true);
    const stored = database.matches.get("game-001")!;
    expect(stored.participants[0]).toEqual({
      id: "u-alice",
      type: "human",
      displayName: "u-alice",
    });
  });
});
