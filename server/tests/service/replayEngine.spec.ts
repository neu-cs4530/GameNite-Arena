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

    it("flags settling for a draw when a win was on the board as an inaccuracy", () => {
      // X to move with a forced win available at [2,2], but [2,1] only holds a
      // draw. Giving up the win for a draw is an inaccuracy, not a blunder (the
      // position is still not a loss).
      //   X O X
      //   O O X
      //   . . .
      const drawWhenWinnable = {
        board: [
          ["X", "O", "X"],
          ["O", "O", "X"],
          [".", ".", "."],
        ],
        nextPlayer: 1,
      };
      const v = analyzeClosedFormMove("tictactoe", drawWhenWinnable, [2, 1]);
      expect(v!.flag).toBe("inaccuracy");
      expect(v!.notes).toBe("This gives up a winning line for a draw.");
      // the suggested move must itself be the winning continuation
      expect(analyzeClosedFormMove("tictactoe", drawWhenWinnable, v!.suggestedMove)!.flag).toBe(
        "best",
      );
    });

    it("scores a played move that can't be parsed as a loss (treated as worst)", () => {
      // From the immediate-win position above, an unparseable played move
      // (a number, not [row,col]) never matches a scored entry, so its outcome
      // is treated as the worst (-1) and flagged a blunder against the win.
      const v = analyzeClosedFormMove("tictactoe", state, 42);
      expect(v!.flag).toBe("blunder");
      expect(v!.notes).toBe("This move loses with best play — a safe move was available.");
    });

    it("scores a legal-shape move not among this position's moves as a loss", () => {
      // [0,0] parses fine but that cell is occupied ("O"), so it isn't in the
      // legal-move set — playedEntry is undefined and the outcome falls to -1.
      const v = analyzeClosedFormMove("tictactoe", state, [0, 0]);
      expect(v!.flag).toBe("blunder");
    });

    it("returns neutral when there are no legal moves (full board)", () => {
      // A completely filled board has no legal moves, so scored is empty.
      const fullBoard = {
        board: [
          ["X", "O", "X"],
          ["X", "O", "O"],
          ["O", "X", "X"],
        ],
        nextPlayer: 1,
      };
      expect(analyzeClosedFormMove("tictactoe", fullBoard, [0, 0])).toStrictEqual({
        flag: "neutral",
        confidence: 1,
      });
    });

    it("scores every legal move as a loss once the board already has a winner", () => {
      // The board already shows three X's in the top row (a finished win), but
      // empty cells remain. ticTacToeLogic.update refuses to move on a won
      // board, so every legal move's reconstruction is null and scores -1.
      const alreadyWon = {
        board: [
          ["X", "X", "X"],
          ["O", "O", "."],
          [".", ".", "."],
        ],
        nextPlayer: 0,
      };
      const v = analyzeClosedFormMove("tictactoe", alreadyWon, [1, 2]);
      // best is -1 too (all moves lose), so the played move ties best → best.
      expect(v).toStrictEqual({ flag: "best", confidence: 1 });
    });
  });
});
