import { describe, expect, it } from "vitest";
import { analyzeClosedFormMove } from "../../src/services/replayEngine.ts";

describe("analyzeClosedFormMove", () => {
  it("returns null for games without a closed-form engine", () => {
    expect(analyzeClosedFormMove("connect4", { board: [], nextPlayer: 0 }, 0)).toBeNull();
    expect(analyzeClosedFormMove("checkers", { board: [], nextPlayer: 0 }, {})).toBeNull();
    expect(analyzeClosedFormMove("guess", { secret: 1, guesses: [] }, 5)).toBeNull();
  });

  describe("nim (misère, take 1-3)", () => {
    it("flags the winning take as best", () => {
      // remaining 6: the winning take is (6 - 1) % 4 === 1.
      expect(analyzeClosedFormMove("nim", { remaining: 6, nextPlayer: 0 }, 1)).toMatchObject({
        flag: "best",
        confidence: 1,
      });
    });

    it("flags a losing take from a winnable position as a blunder, suggesting the win", () => {
      expect(analyzeClosedFormMove("nim", { remaining: 6, nextPlayer: 0 }, 3)).toMatchObject({
        flag: "blunder",
        confidence: 1,
        suggestedMove: 1,
      });
    });

    it("flags an already-lost position as neutral with no suggestion", () => {
      // remaining 5: (5 - 1) % 4 === 0, so no take leaves the opponent a loss.
      const v = analyzeClosedFormMove("nim", { remaining: 5, nextPlayer: 0 }, 2);
      expect(v).toMatchObject({ flag: "neutral", confidence: 1 });
      expect(v!.suggestedMove).toBeUndefined();
    });
  });

  describe("tic-tac-toe (minimax)", () => {
    // X = player 1 (moves first). X has an immediate win in the middle row:
    //   O O .
    //   X X .
    //   . . .
    // [1,2] completes the row and wins. [2,2] ignores it — O then wins the top
    // row, so [2,2] is a blunder.
    const state = {
      board: [
        ["O", "O", "."],
        ["X", "X", "."],
        [".", ".", "."],
      ],
      nextPlayer: 1,
    };

    it("flags the immediately-winning move as best", () => {
      expect(analyzeClosedFormMove("tictactoe", state, [1, 2])).toMatchObject({
        flag: "best",
        confidence: 1,
      });
    });

    it("flags throwing away the win as a blunder and suggests a winning move", () => {
      const v = analyzeClosedFormMove("tictactoe", state, [2, 2]);
      expect(v!.flag).toBe("blunder");
      expect(v!.confidence).toBe(1);
      expect(v!.suggestedMove).toBeDefined();
      // the suggested move must itself be optimal from this position
      expect(analyzeClosedFormMove("tictactoe", state, v!.suggestedMove)!.flag).toBe("best");
    });
  });
});
