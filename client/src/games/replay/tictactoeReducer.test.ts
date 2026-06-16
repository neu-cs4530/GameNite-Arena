import { describe, expect, it } from "vitest";
import {
  applyTicTacToeMove,
  buildInitialTicTacToeState,
  notateTicTacToeMove,
  tictactoeViewFromState,
} from "./tictactoeReducer.ts";

describe("buildInitialTicTacToeState", () => {
  it("starts with an empty 3x3 board and X (player 1) to move", () => {
    const state = buildInitialTicTacToeState();
    expect(state.nextPlayer).toBe(1);
    expect(state.board.every((row) => row.every((cell) => cell === "."))).toBe(true);
  });
});

describe("applyTicTacToeMove", () => {
  it("places X when player 1 moves", () => {
    const state = buildInitialTicTacToeState();
    const next = applyTicTacToeMove(state, [0, 0]);
    expect(next.board[0][0]).toBe("X");
    expect(next.nextPlayer).toBe(0);
  });

  it("places O when player 0 moves", () => {
    const after1 = applyTicTacToeMove(buildInitialTicTacToeState(), [0, 0]);
    const after2 = applyTicTacToeMove(after1, [1, 1]);
    expect(after2.board[1][1]).toBe("O");
    expect(after2.nextPlayer).toBe(1);
  });
});

describe("tictactoeViewFromState — no winner", () => {
  it("returns null winningEntry on an empty board", () => {
    const view = tictactoeViewFromState(buildInitialTicTacToeState());
    expect(view.winningEntry).toBeNull();
  });
});

describe("tictactoeViewFromState — winning lines", () => {
  function stateWith(board: string[][]): Parameters<typeof tictactoeViewFromState>[0] {
    return { board: board as never, nextPlayer: 0 };
  }

  it("detects a row win", () => {
    const board = [
      ["X", "X", "X"],
      ["O", "O", "."],
      [".", ".", "."],
    ];
    expect(tictactoeViewFromState(stateWith(board)).winningEntry).not.toBeNull();
  });

  it("detects a column win", () => {
    const board = [
      ["X", "O", "."],
      ["X", "O", "."],
      ["X", ".", "."],
    ];
    expect(tictactoeViewFromState(stateWith(board)).winningEntry).not.toBeNull();
  });

  it("detects a main-diagonal win", () => {
    const board = [
      ["X", "O", "."],
      [".", "X", "O"],
      [".", ".", "X"],
    ];
    expect(tictactoeViewFromState(stateWith(board)).winningEntry).not.toBeNull();
  });

  it("detects an anti-diagonal win", () => {
    const board = [
      [".", "O", "X"],
      [".", "X", "O"],
      ["X", ".", "."],
    ];
    expect(tictactoeViewFromState(stateWith(board)).winningEntry).not.toBeNull();
  });

  it("returns null when no line is complete", () => {
    const board = [
      ["X", "O", "X"],
      ["O", ".", "O"],
      ["O", "X", "X"],
    ];
    expect(tictactoeViewFromState(stateWith(board)).winningEntry).toBeNull();
  });
});

describe("notateTicTacToeMove", () => {
  it("maps [row, col] to column-letter + row-number notation", () => {
    expect(notateTicTacToeMove([0, 0])).toBe("A1");
    expect(notateTicTacToeMove([0, 2])).toBe("C1");
    expect(notateTicTacToeMove([2, 1])).toBe("B3");
  });
});
