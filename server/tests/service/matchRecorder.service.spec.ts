import { beforeEach, describe, expect, it } from "vitest";
import type { GameRecord } from "../../src/models.ts";
import {
  DEFAULT_IDLE_TIMEOUT_MS,
  MatchRecorder,
} from "../../src/services/matchRecorder.service.ts";
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

  it("does not list a positional AI seat as a human participant", async () => {
    const seatedGame: GameRecord = {
      ...baseGame,
      players: ["u-alice", "dep-9"],
      aiPlayers: [null, { deploymentId: "dep-9", modelId: "model-9", displayName: "SeatBot" }],
    };
    await recorder.captureMove(seatedGame, "game-seats", "u-alice", { take: 2 }, true);
    const stored = database.matches.get("game-seats")!;
    expect(stored.participants).toEqual([
      { id: "u-alice", type: "human", displayName: "Alice" },
      { id: "model-9", type: "ai", displayName: "SeatBot" },
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

  it("archives { outcome: 'win', winnerId } when the caller resolves a winner", async () => {
    await recorder.captureMove(baseGame, "game-001", "u-alice", 3, false);
    await recorder.captureMove(baseGame, "game-001", "u-bob", 3, true, undefined, "u-bob");
    const stored = database.matches.get("game-001")!;
    expect(stored.result).toEqual({ outcome: "win", winnerId: "u-bob" });
  });

  it("archives { outcome: 'draw' } when the caller passes winnerId null", async () => {
    await recorder.captureMove(baseGame, "game-001", "u-alice", 50, false);
    await recorder.captureMove(baseGame, "game-001", "u-bob", 50, true, undefined, null);
    const stored = database.matches.get("game-001")!;
    expect(stored.result).toEqual({ outcome: "draw" });
    expect(stored.result.winnerId).toBeUndefined();
  });

  it("archives a winnerless win when the game has no winner hook (winnerId undefined)", async () => {
    await recorder.captureMove(baseGame, "game-001", "u-alice", 3, true, undefined, undefined);
    expect(database.matches.get("game-001")!.result).toEqual({ outcome: "win" });
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

  it("records the first move's stateBeforeMove as the match's initialState", async () => {
    const initial = { remaining: 21, nextPlayer: 0 };
    await recorder.captureMove(baseGame, "game-001", "u-alice", 3, false, initial);
    // Later moves' pre-states must not overwrite the initial one.
    await recorder.captureMove(baseGame, "game-001", "u-bob", 3, true, {
      remaining: 18,
      nextPlayer: 1,
    });
    expect(database.matches.get("game-001")!.initialState).toEqual(initial);
  });

  it("drops moves arriving after finalize has begun (concurrent duplicate of the final move)", async () => {
    // Slow repo: finalize stays in-flight until we release it, so the
    // duplicate arrives mid-finalize like a real double-submit race.
    let releaseSave!: () => void;
    const slowSave = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const slowRepo = new InMemoryMatchRepo();
    const slowDatabase = {
      saveMatch: async (record: Parameters<InMemoryMatchRepo["saveMatch"]>[0]) => {
        await slowSave;
        await slowRepo.saveMatch(record);
      },
    };
    const racingRecorder = new MatchRecorder({
      database: slowDatabase,
      resolveDisplayName,
      getCurrentTime,
    });

    await racingRecorder.captureMove(baseGame, "game-001", "u-alice", 3, false);
    const finalize = racingRecorder.captureMove(baseGame, "game-001", "u-bob", 3, true);
    // Duplicate of the final move lands while saveMatch is still pending.
    const duplicate = racingRecorder.captureMove(baseGame, "game-001", "u-bob", 3, true);
    releaseSave();
    await Promise.all([finalize, duplicate]);

    const stored = slowRepo.matches.get("game-001")!;
    expect(stored.moves).toHaveLength(2);
  });

  it("ignores captures for an already-finalized game entirely", async () => {
    await recorder.captureMove(baseGame, "game-001", "u-alice", 3, true);
    const before = database.matches.get("game-001")!;
    await recorder.captureMove(baseGame, "game-001", "u-bob", 2, true);
    const after = database.matches.get("game-001")!;
    expect(after.moves).toHaveLength(1);
    expect(after).toEqual(before);
    expect(recorder.isRecording("game-001")).toBe(false);
  });

  it("resetForTests clears both tracking and the finalized guard", async () => {
    await recorder.captureMove(baseGame, "game-001", "u-alice", 3, true);
    recorder.resetForTests();
    // After reset the same gameId can be recorded fresh.
    await recorder.captureMove(baseGame, "game-001", "u-alice", 2, true);
    expect(database.matches.get("game-001")!.moves.map((m) => m.move)).toEqual([2]);
  });

  describe("forfeit finalization (CoS 2.8)", () => {
    const seatedGame: GameRecord = {
      ...baseGame,
      players: ["u-alice", "dep-9"],
      aiPlayers: [null, { deploymentId: "dep-9", modelId: "model-9", displayName: "SeatBot" }],
      state: { remaining: 7, nextPlayer: 1 },
    };

    it("finalizeAsForfeit persists the buffered moves with outcome forfeit and the winner", async () => {
      await recorder.captureMove(seatedGame, "game-001", "u-alice", 3, false, {
        remaining: 21,
        nextPlayer: 0,
      });
      await recorder.captureMove(seatedGame, "game-001", "dep-9", 2, false);

      await recorder.finalizeAsForfeit(seatedGame, "game-001", "u-alice");

      const stored = database.matches.get("game-001")!;
      expect(stored.result).toEqual({ outcome: "forfeit", winnerId: "u-alice" });
      expect(stored.moves.map((m) => m.move)).toEqual([3, 2]);
      expect(stored.initialState).toEqual({ remaining: 21, nextPlayer: 0 });
      expect(recorder.isRecording("game-001")).toBe(false);
    });

    it("synthesizes an entry when the forfeit lands before any captured move", async () => {
      await recorder.finalizeAsForfeit(seatedGame, "game-opening", "u-alice");

      const stored = database.matches.get("game-opening")!;
      expect(stored.result).toEqual({ outcome: "forfeit", winnerId: "u-alice" });
      expect(stored.moves).toEqual([]);
      // The synthesized entry snapshots the game's current state and seats.
      expect(stored.initialState).toEqual({ remaining: 7, nextPlayer: 1 });
      expect(stored.participants).toEqual([
        { id: "u-alice", type: "human", displayName: "Alice" },
        { id: "model-9", type: "ai", displayName: "SeatBot" },
      ]);
      expect(stored.rated).toBe(true);
    });

    it("is a no-op for an already-finalized game", async () => {
      await recorder.captureMove(seatedGame, "game-001", "u-alice", 3, true, undefined, "u-alice");
      const finished = database.matches.get("game-001")!;

      await recorder.finalizeAsForfeit(seatedGame, "game-001", "dep-9");

      expect(database.matches.get("game-001")).toEqual(finished);
      expect(database.matches.get("game-001")!.result).toEqual({
        outcome: "win",
        winnerId: "u-alice",
      });
    });
  });

  describe("abandoned-game finalization", () => {
    it("finalizeAsAbandoned persists the buffered moves with outcome abandoned and no winner", async () => {
      await recorder.captureMove(baseGame, "game-001", "u-alice", 3, false, {
        remaining: 21,
        nextPlayer: 0,
      });
      await recorder.captureMove(baseGame, "game-001", "u-bob", 2, false);

      await recorder.finalizeAsAbandoned("game-001");

      const stored = database.matches.get("game-001")!;
      expect(stored.result).toEqual({ outcome: "abandoned" });
      expect(stored.result.winnerId).toBeUndefined();
      expect(stored.moves.map((m) => m.move)).toEqual([3, 2]);
      expect(stored.initialState).toEqual({ remaining: 21, nextPlayer: 0 });
      expect(recorder.isRecording("game-001")).toBe(false);
    });

    it("finalizeAsAbandoned marks the game finalized so later captures are ignored", async () => {
      await recorder.captureMove(baseGame, "game-001", "u-alice", 3, false);
      await recorder.finalizeAsAbandoned("game-001");
      // A straggler move (e.g. a delayed retry) must not resurrect the game.
      await recorder.captureMove(baseGame, "game-001", "u-bob", 1, true);
      const stored = database.matches.get("game-001")!;
      expect(stored.result).toEqual({ outcome: "abandoned" });
      expect(stored.moves).toHaveLength(1);
      expect(recorder.isRecording("game-001")).toBe(false);
    });

    it("finalizeAsAbandoned is a no-op for untracked or already-finalized games", async () => {
      await recorder.finalizeAsAbandoned("never-seen");
      expect(database.matches.size).toBe(0);

      await recorder.captureMove(baseGame, "game-001", "u-alice", 3, true);
      const finished = database.matches.get("game-001")!;
      await recorder.finalizeAsAbandoned("game-001");
      // The cleanly-finished archive is untouched.
      expect(database.matches.get("game-001")).toEqual(finished);
      expect(database.matches.get("game-001")!.result).toEqual({ outcome: "win" });
    });

    it("sweepIdleMatches abandons entries idle longer than maxIdleMs and keeps fresh ones", async () => {
      const game2: GameRecord = { ...baseGame, players: ["u-alice", "u-carol"] };
      await recorder.captureMove(baseGame, "game-old", "u-alice", 3, false);
      // Time passes; game-new sees its move much later.
      fakeTime += 10_000;
      await recorder.captureMove(game2, "game-new", "u-alice", 2, false);

      await recorder.sweepIdleMatches(5_000);

      expect(recorder.isRecording("game-old")).toBe(false);
      expect(recorder.isRecording("game-new")).toBe(true);
      expect(database.matches.get("game-old")!.result).toEqual({ outcome: "abandoned" });
      expect(database.matches.has("game-new")).toBe(false);
    });

    it("sweepIdleMatches does not abandon entries at or under the idle threshold", async () => {
      await recorder.captureMove(baseGame, "game-001", "u-alice", 3, false);
      fakeTime += 4_000;
      await recorder.sweepIdleMatches(5_000);
      expect(recorder.isRecording("game-001")).toBe(true);
      expect(database.matches.size).toBe(0);
    });

    it("captureMove lazily sweeps games idle past DEFAULT_IDLE_TIMEOUT_MS", async () => {
      const game2: GameRecord = { ...baseGame, players: ["u-alice", "u-carol"] };
      await recorder.captureMove(baseGame, "game-stale", "u-alice", 3, false);
      // More than an hour of (fake) silence, then activity on another game.
      fakeTime += DEFAULT_IDLE_TIMEOUT_MS + 60_000;
      await recorder.captureMove(game2, "game-active", "u-alice", 2, false);

      expect(recorder.isRecording("game-stale")).toBe(false);
      expect(database.matches.get("game-stale")!.result).toEqual({ outcome: "abandoned" });
      // The triggering game records normally.
      expect(recorder.isRecording("game-active")).toBe(true);
    });

    it("the lazy sweep skips the game being captured even if it was idle", async () => {
      await recorder.captureMove(baseGame, "game-001", "u-alice", 3, false);
      // The same game goes quiet past the timeout, then its player returns.
      fakeTime += DEFAULT_IDLE_TIMEOUT_MS + 60_000;
      await recorder.captureMove(baseGame, "game-001", "u-bob", 2, true, undefined, "u-bob");

      // It finalizes as a normal win, not as abandoned.
      const stored = database.matches.get("game-001")!;
      expect(stored.result).toEqual({ outcome: "win", winnerId: "u-bob" });
      expect(stored.moves).toHaveLength(2);
    });
  });
});
