import { afterEach, describe, expect, it, vi } from "vitest";
import type { MatchRecord } from "../../src/models.ts";
import { DeploymentRepo, MatchRepo } from "../../src/repository.ts";
import { analyzeReplay } from "../../src/services/analysis.service.ts";
import {
  resetInferenceClientForTests,
  setInferenceClientForTests,
} from "../../src/services/inferenceClient.ts";

const P1 = { id: "u-p1", type: "human" as const, displayName: "Player One" };
const P2 = { id: "u-p2", type: "human" as const, displayName: "Player Two" };

function nimMatch(moves: number[]): MatchRecord {
  return {
    gameId: "game-nim-1",
    gameKey: "nim",
    rated: true,
    participants: [P1, P2],
    moves: moves.map((move, i) => ({
      actor: i % 2 === 0 ? P1.id : P2.id,
      move,
      timestamp: `2026-06-09T00:0${i}:00.000Z`,
    })),
    result: { outcome: "win", winnerId: P1.id },
    initialState: { remaining: 21, nextPlayer: 0 },
    createdAt: "2026-06-09T00:10:00.000Z",
    completedAt: "2026-06-09T00:10:00.000Z",
  };
}

function guessMatch(moves: number[], secret?: number): MatchRecord {
  return {
    gameId: "game-guess-1",
    gameKey: "guess",
    rated: false,
    participants: [P1, P2],
    moves: moves.map((move, i) => ({
      actor: i % 2 === 0 ? P1.id : P2.id,
      move,
      timestamp: `2026-06-09T01:0${i}:00.000Z`,
    })),
    result: { outcome: "win", winnerId: P1.id },
    initialState: secret === undefined ? undefined : { secret, guesses: [] },
    createdAt: "2026-06-09T01:10:00.000Z",
    completedAt: "2026-06-09T01:10:00.000Z",
  };
}

function tttMatch(moves: [number, number][]): MatchRecord {
  return {
    gameId: "game-ttt-1",
    gameKey: "tictactoe",
    rated: true,
    participants: [P1, P2],
    moves: moves.map((move, i) => ({
      actor: i % 2 === 0 ? P1.id : P2.id,
      move,
      timestamp: `2026-06-09T02:0${i}:00.000Z`,
    })),
    result: { outcome: "win", winnerId: P1.id },
    // tic-tac-toe: player 1 ("X") moves first.
    initialState: {
      board: [
        [".", ".", "."],
        [".", ".", "."],
        [".", ".", "."],
      ],
      nextPlayer: 1,
    },
    createdAt: "2026-06-09T02:10:00.000Z",
    completedAt: "2026-06-09T02:10:00.000Z",
  };
}

function connect4Match(moves: number[]): MatchRecord {
  const board = Array.from({ length: 6 }, () => [".", ".", ".", ".", ".", ".", "."]);
  return {
    gameId: "game-c4-1",
    gameKey: "connect4",
    rated: true,
    participants: [P1, P2],
    moves: moves.map((move, i) => ({
      actor: i % 2 === 0 ? P1.id : P2.id,
      move,
      timestamp: `2026-06-09T03:0${i}:00.000Z`,
    })),
    result: { outcome: "win", winnerId: P1.id },
    initialState: { board, nextPlayer: 0 },
    createdAt: "2026-06-09T03:10:00.000Z",
    completedAt: "2026-06-09T03:10:00.000Z",
  };
}

describe("analyzeReplay", () => {
  it("returns null for an unknown match", async () => {
    expect(await analyzeReplay("nope")).toBeNull();
  });

  it("nim: flags an already-lost position, a blunder, and the best move", async () => {
    // 21 % 4 === 1, so move 0 is already a forced loss no matter what's taken.
    // After taking 3 (remaining 18), the winning take is 1 — taking 3 again is
    // a blunder. After that (remaining 15), the winning take is 2.
    await MatchRepo.set("m-nim", nimMatch([3, 3, 2]));

    const result = await analyzeReplay("m-nim");

    expect(result!.matchId).toBe("m-nim");
    expect(result!.perMove[0].flag).toBe("neutral");
    expect(result!.perMove[1]).toMatchObject({ flag: "blunder", suggestedMove: 1 });
    expect(result!.perMove[2]).toMatchObject({ flag: "best" });
  });

  it("tictactoe: produces real per-move engine verdicts, not empty neutral", async () => {
    // A short real game: X center, O corner, X corner. The point is that the
    // engine actually runs (confidence 1, valid flags) — previously every
    // tic-tac-toe move fell through to the guess analyzer as neutral/0.
    await MatchRepo.set(
      "m-ttt",
      tttMatch([
        [1, 1],
        [0, 0],
        [2, 2],
      ]),
    );

    const result = await analyzeReplay("m-ttt");

    expect(result!.perMove).toHaveLength(3);
    expect(result!.perMove.every((p) => p.confidence === 1)).toBe(true);
    expect(
      result!.perMove.every((p) => ["best", "blunder", "inaccuracy", "neutral"].includes(p.flag)),
    ).toBe(true);
  });

  it("guess: returns neutral with no built-in analysis (engine stripped)", async () => {
    await MatchRepo.set("m-guess", guessMatch([45, 90, 50], 50));

    const result = await analyzeReplay("m-guess");

    expect(result!.perMove).toStrictEqual([
      { moveIndex: 0, flag: "neutral", confidence: 0 },
      { moveIndex: 1, flag: "neutral", confidence: 0 },
      { moveIndex: 2, flag: "neutral", confidence: 0 },
    ]);
  });

  it("connect4: neutral flags (no built-in engine), regardless of the secret", async () => {
    await MatchRepo.set("m-c4", connect4Match([3, 3]));

    const result = await analyzeReplay("m-c4");

    expect(result!.perMove.map((p) => p.flag)).toStrictEqual(["neutral", "neutral"]);
    expect(result!.perMove[0].confidence).toBe(0);
  });

  it("omits engineMove when no deploymentId is given", async () => {
    await MatchRepo.set("m-nim-no-deployment", nimMatch([3]));

    const result = await analyzeReplay("m-nim-no-deployment");

    expect(result!.perMove[0].engineMove).toBeUndefined();
    expect(result!.aiError).toBeUndefined();
  });

  describe("with a deploymentId", () => {
    afterEach(() => {
      resetInferenceClientForTests();
    });

    it("nim: attaches the loaded model's move as engineMove", async () => {
      setInferenceClientForTests({ requestMove: () => Promise.resolve({ move: 1 }) });
      await MatchRepo.set("m-nim-engine", nimMatch([3]));

      const result = await analyzeReplay("m-nim-engine", "dep-1");

      expect(result!.perMove[0].engineMove).toBe(1);
      expect(result!.aiError).toBeUndefined();
    });

    it("tictactoe: feeds the model the board state (not the guess placeholder)", async () => {
      const requestMove = vi.fn().mockResolvedValue({ move: [0, 2] });
      setInferenceClientForTests({ requestMove });
      await MatchRepo.set("m-ttt-engine", tttMatch([[1, 1]]));

      const result = await analyzeReplay("m-ttt-engine", "dep-1");

      expect(result!.perMove[0].engineMove).toStrictEqual([0, 2]);
      expect(requestMove).toHaveBeenCalledWith(
        expect.objectContaining({
          deploymentId: "dep-1",
          state: expect.objectContaining({ board: expect.any(Array) }),
        }),
      );
    });

    it("connect4: AI-only — neutral engine flags but a real model move with the board", async () => {
      const requestMove = vi.fn().mockResolvedValue({ move: 3 });
      setInferenceClientForTests({ requestMove });
      await MatchRepo.set("m-c4-engine", connect4Match([3, 3]));

      const result = await analyzeReplay("m-c4-engine", "dep-1");

      expect(result!.perMove.map((p) => p.flag)).toStrictEqual(["neutral", "neutral"]);
      expect(result!.perMove[0].engineMove).toBe(3);
      expect(requestMove).toHaveBeenCalledWith(
        expect.objectContaining({ state: expect.objectContaining({ board: expect.any(Array) }) }),
      );
    });

    it("reports aiError and omits engineMove when the inference call fails", async () => {
      setInferenceClientForTests({
        requestMove: () => Promise.reject(new Error("inference down")),
      });
      await MatchRepo.set("m-nim-engine-down", nimMatch([3]));

      const result = await analyzeReplay("m-nim-engine-down", "dep-1");

      expect(result!.aiError).toBeDefined();
      expect(result!.perMove[0].engineMove).toBeUndefined();
    });

    it("loads the deployed model into inference before requesting moves", async () => {
      await DeploymentRepo.set("dep-loaded", {
        modelId: "model-1",
        userId: "u-owner",
        gameKey: "nim",
        displayName: "Test Model",
        status: "active",
        createdAt: "2026-06-09T00:00:00.000Z",
        updatedAt: "2026-06-09T00:00:00.000Z",
      });
      const loadModel = vi.fn().mockResolvedValue({ status: "loaded" });
      setInferenceClientForTests({ loadModel });
      await MatchRepo.set("m-nim-load", nimMatch([3]));

      await analyzeReplay("m-nim-load", "dep-loaded");

      expect(loadModel).toHaveBeenCalledWith({
        deploymentId: "dep-loaded",
        game: "nim",
        modelId: "model-1",
      });
    });
  });
});
