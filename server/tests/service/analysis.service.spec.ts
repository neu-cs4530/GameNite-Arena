import { afterEach, describe, expect, it, vi } from "vitest";
import type { MatchRecord } from "../../src/models.ts";
import { DeploymentRepo, MatchRepo } from "../../src/repository.ts";
import { analyzeReplay } from "../../src/services/analysis.service.ts";
import {
  InferenceError,
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

const ChRed = { id: "u-ch-red", type: "human" as const, displayName: "Red Player" };
const ChBlack = { id: "u-ch-black", type: "human" as const, displayName: "Black Player" };

/** An 8x8 checkers board, "." everywhere except the given squares. */
function checkersBoard(pieces: Record<string, string>): string[][] {
  const board = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => "."));
  for (const [key, entry] of Object.entries(pieces)) {
    const [row, col] = key.split(",").map(Number);
    board[row][col] = entry;
  }
  return board;
}

/** A one-move checkers match: red king at (6,1) shuffles to (5,0). */
function checkersMatch(): MatchRecord {
  return {
    gameId: "game-ch-1",
    gameKey: "checkers",
    rated: true,
    participants: [ChRed, ChBlack],
    moves: [
      {
        actor: ChRed.id,
        move: {
          squares: [
            [6, 1],
            [5, 0],
          ],
        },
        timestamp: "2026-06-09T05:00:00.000Z",
      },
    ],
    result: { outcome: "win", winnerId: ChRed.id },
    initialState: {
      board: checkersBoard({ "1,2": "B", "4,5": "R", "6,1": "RK" }),
      nextPlayer: 0,
    },
    createdAt: "2026-06-09T05:10:00.000Z",
    completedAt: "2026-06-09T05:10:00.000Z",
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

  describe("state reconstruction fallbacks", () => {
    it("falls back to the game's canonical start when the archive has no initialState", async () => {
      // nim is engine-solvable, so states are reconstructed even with no
      // deployment. Without initialState the engine starts from nim's canonical
      // 21-object start; move 0 is the already-lost position (21 % 4 === 1).
      const match = nimMatch([3]);
      delete (match as { initialState?: unknown }).initialState;
      await MatchRepo.set("m-nim-no-initial", match);

      const result = await analyzeReplay("m-nim-no-initial");

      expect(result!.perMove[0].flag).toBe("neutral");
      expect(result!.perMove[0].confidence).toBe(1);
    });

    it("defaults nextPlayer to 0 when the reconstructed state omits it", async () => {
      // initialState lacks nextPlayer, so reconstructStates falls back to 0.
      // With seat 0 to move and remaining 21, move 0 is again the lost position.
      const match = nimMatch([3]);
      (match as { initialState?: unknown }).initialState = { remaining: 21 };
      await MatchRepo.set("m-nim-no-nextplayer", match);

      const result = await analyzeReplay("m-nim-no-nextplayer");

      expect(result!.perMove).toHaveLength(1);
      expect(result!.perMove[0].flag).toBe("neutral");
    });

    it("keeps the prior state when an archived move doesn't replay cleanly", async () => {
      // Taking 99 from 21 is illegal, so update returns null and the state is
      // carried forward unchanged — both moves analyze from remaining 21.
      const match = nimMatch([99, 3]);
      await MatchRepo.set("m-nim-illegal", match);

      const result = await analyzeReplay("m-nim-illegal");

      expect(result!.perMove).toHaveLength(2);
      // 21 % 4 === 1 is lost, so both positions are neutral (already-lost).
      expect(result!.perMove.map((p) => p.flag)).toStrictEqual(["neutral", "neutral"]);
    });
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

    it("describes a 503 InferenceError as the service being unreachable", async () => {
      setInferenceClientForTests({
        requestMove: () => Promise.reject(new InferenceError("down", 503)),
      });
      await MatchRepo.set("m-nim-503", nimMatch([3]));

      const result = await analyzeReplay("m-nim-503", "dep-1");

      expect(result!.aiError).toBe("The inference service is unreachable right now.");
    });

    it("describes a 404 InferenceError as the model not being available", async () => {
      setInferenceClientForTests({
        requestMove: () => Promise.reject(new InferenceError("missing", 404)),
      });
      await MatchRepo.set("m-nim-404", nimMatch([3]));

      const result = await analyzeReplay("m-nim-404", "dep-1");

      expect(result!.aiError).toBe("That model isn't available for inference.");
    });

    it("surfaces the raw message for other InferenceError statuses", async () => {
      setInferenceClientForTests({
        requestMove: () => Promise.reject(new InferenceError("bad request payload", 422)),
      });
      await MatchRepo.set("m-nim-422", nimMatch([3]));

      const result = await analyzeReplay("m-nim-422", "dep-1");

      expect(result!.aiError).toBe("bad request payload");
    });

    it("checkers: feeds the model the position's legal-move list", async () => {
      const requestMove = vi.fn().mockResolvedValue({
        move: {
          squares: [
            [6, 1],
            [5, 0],
          ],
        },
      });
      setInferenceClientForTests({ requestMove });
      await MatchRepo.set("m-ch-engine", checkersMatch());

      const result = await analyzeReplay("m-ch-engine", "dep-1");

      // checkers isn't engine-solvable, so the flag is neutral, but the model
      // ran with the dynamic legal-move list the watcher view carries.
      expect(result!.perMove[0].flag).toBe("neutral");
      expect(requestMove).toHaveBeenCalledWith(
        expect.objectContaining({
          deploymentId: "dep-1",
          legalMoves: expect.any(Array),
        }),
      );
      expect(requestMove.mock.calls[0][0].legalMoves.length).toBeGreaterThan(0);
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
