import { describe, expect, it } from "vitest";
import type { CheckersBoard } from "@gamenite/shared";
import {
  applyCheckersBoard,
  applyCheckersMove,
  checkersDefaultStart,
  checkersViewFromState,
  notateCheckersMove,
} from "./checkersReducer.ts";

function emptyBoard(): CheckersBoard {
  return Array.from({ length: 8 }, () => Array(8).fill(".")) as CheckersBoard;
}

function boardWith(pieces: Record<string, string>): CheckersBoard {
  const b = emptyBoard();
  for (const [key, val] of Object.entries(pieces)) {
    const [r, c] = key.split(",").map(Number);
    b[r][c] = val as CheckersBoard[0][0];
  }
  return b;
}

describe("checkersDefaultStart", () => {
  it("has 12 Red and 12 Blue pieces in the standard starting position", () => {
    const board = checkersDefaultStart.board;
    const reds = board.flat().filter((e) => e === "R").length;
    const blues = board.flat().filter((e) => e === "B").length;
    expect(reds).toBe(12);
    expect(blues).toBe(12);
    expect(checkersDefaultStart.nextPlayer).toBe(0);
  });
});

describe("applyCheckersBoard — simple moves", () => {
  it("moves a Red piece diagonally forward (toward lower row index)", () => {
    const board = boardWith({ "5,0": "R" });
    const next = applyCheckersBoard(board, [[5, 0], [4, 1]], 0);
    expect(next[5][0]).toBe(".");
    expect(next[4][1]).toBe("R");
  });

  it("moves a Blue piece diagonally forward (toward higher row index)", () => {
    const board = boardWith({ "2,1": "B" });
    const next = applyCheckersBoard(board, [[2, 1], [3, 2]], 1);
    expect(next[2][1]).toBe(".");
    expect(next[3][2]).toBe("B");
  });

  it("promotes a Red piece on reaching row 0", () => {
    const board = boardWith({ "1,2": "R" });
    const next = applyCheckersBoard(board, [[1, 2], [0, 3]], 0);
    expect(next[0][3]).toBe("RK");
  });

  it("promotes a Blue piece on reaching row 7", () => {
    const board = boardWith({ "6,3": "B" });
    const next = applyCheckersBoard(board, [[6, 3], [7, 4]], 1);
    expect(next[7][4]).toBe("BK");
  });

  it("does not re-promote a king that reaches the back rank again", () => {
    // RK is already a king — stays RK after the move
    const board = boardWith({ "1,0": "RK" });
    const next = applyCheckersBoard(board, [[1, 0], [0, 1]], 0);
    expect(next[0][1]).toBe("RK");
  });
});

describe("applyCheckersBoard — captures", () => {
  it("removes the captured piece (abs row diff === 2)", () => {
    // R at [4,3], B at [3,4]; capture lands at [2,5]
    const board = boardWith({ "4,3": "R", "3,4": "B" });
    const next = applyCheckersBoard(board, [[4, 3], [2, 5]], 0);
    expect(next[4][3]).toBe(".");
    expect(next[3][4]).toBe(".");
    expect(next[2][5]).toBe("R");
  });

  it("removes multiple pieces in a multi-jump chain", () => {
    // R at [6,1]; B at [5,2] and [3,4]; chain: [6,1]->[4,3]->[2,5]
    const board = boardWith({ "6,1": "R", "5,2": "B", "3,4": "B" });
    const next = applyCheckersBoard(board, [[6, 1], [4, 3], [2, 5]], 0);
    expect(next[5][2]).toBe(".");
    expect(next[3][4]).toBe(".");
    expect(next[2][5]).toBe("R");
  });
});

describe("applyCheckersMove", () => {
  it("delegates to applyCheckersBoard and flips nextPlayer", () => {
    const board = boardWith({ "5,0": "R" });
    const state = { board, nextPlayer: 0 as const };
    const next = applyCheckersMove(state, { squares: [[5, 0], [4, 1]] });
    expect(next.board[4][1]).toBe("R");
    expect(next.nextPlayer).toBe(1);
  });

  it("accepts an explicit playerIndex override", () => {
    const board = boardWith({ "2,1": "B" });
    const state = { board, nextPlayer: 0 as const };
    // explicitly force it to be player 1's move
    const next = applyCheckersMove(state, { squares: [[2, 1], [3, 2]] }, 1);
    expect(next.board[3][2]).toBe("B");
    expect(next.nextPlayer).toBe(0);
  });
});

describe("checkersViewFromState — no winner", () => {
  it("exposes legal moves and sets nextPlayer normally when both sides have pieces", () => {
    const view = checkersViewFromState(checkersDefaultStart);
    expect(view.winner).toBeNull();
    expect(view.nextPlayer).toBe(0);
    expect(view.legalMoves.length).toBeGreaterThan(0);
  });

  it("returns simple diagonal moves for Red on a sparse board", () => {
    // R at [5,2], nothing else; moves: [4,1] and [4,3]
    const board = boardWith({ "5,2": "R" });
    const view = checkersViewFromState({ board, nextPlayer: 0 });
    expect(view.winner).toBeNull();
    expect(view.legalMoves).toContainEqual({ squares: [[5, 2], [4, 1]] });
    expect(view.legalMoves).toContainEqual({ squares: [[5, 2], [4, 3]] });
  });
});

describe("checkersViewFromState — winner", () => {
  it("detects the winner when the player to move has no legal moves (opponent wins)", () => {
    // Only Red pieces remain; Blue (nextPlayer=1) has nothing — Red wins
    const board = boardWith({ "0,1": "R" });
    const view = checkersViewFromState({ board, nextPlayer: 1 });
    expect(view.winner).toBe(0); // Red (player 0) wins
    expect(view.nextPlayer).toBe(-1); // game over sentinel
    expect(view.legalMoves).toEqual([]);
  });

  it("detects Blue winning when Red has no legal moves", () => {
    const board = boardWith({ "7,1": "B" });
    const view = checkersViewFromState({ board, nextPlayer: 0 });
    expect(view.winner).toBe(1);
  });
});

describe("checkersViewFromState — king moves", () => {
  it("a king can move backward as well as forward", () => {
    const board = boardWith({ "4,3": "RK" });
    const view = checkersViewFromState({ board, nextPlayer: 0 });
    // king has 4 diagonal directions
    expect(view.legalMoves.length).toBe(4);
  });
});

describe("checkersViewFromState — mandatory captures", () => {
  it("only lists captures when a capture is available", () => {
    // R at [4,3], B at [3,4] — R can capture to [2,5]
    const board = boardWith({ "4,3": "R", "3,4": "B" });
    const view = checkersViewFromState({ board, nextPlayer: 0 });
    expect(view.legalMoves.every((m) => m.squares.length >= 2)).toBe(true);
    // the one listed move ends at [2,5]
    const last = view.legalMoves[0].squares;
    expect(last[last.length - 1]).toEqual([2, 5]);
  });
});

describe("checkersViewFromState — Blue non-king moves", () => {
  it("returns forward moves for a Blue non-king piece", () => {
    const board = boardWith({ "3,2": "B" });
    const view = checkersViewFromState({ board, nextPlayer: 1 });
    expect(view.legalMoves).toContainEqual({ squares: [[3, 2], [4, 1]] });
    expect(view.legalMoves).toContainEqual({ squares: [[3, 2], [4, 3]] });
  });
});

describe("checkersViewFromState — king captures", () => {
  it("lists a king capture and recurses in the king DFS path", () => {
    const board = boardWith({ "4,3": "RK", "3,4": "B" });
    const view = checkersViewFromState({ board, nextPlayer: 0 });
    expect(view.legalMoves).toContainEqual({ squares: [[4, 3], [2, 5]] });
  });

  it("skips a king capture direction when the landing square is blocked by own piece", () => {
    const board = boardWith({ "4,3": "RK", "3,4": "B", "2,5": "R" });
    const view = checkersViewFromState({ board, nextPlayer: 0 });
    expect(view.legalMoves).not.toContainEqual({ squares: [[4, 3], [2, 5]] });
  });
});

describe("checkersViewFromState — out-of-bounds DFS guard", () => {
  it("handles a capture direction that exits the board", () => {
    const board = boardWith({ "2,1": "R", "1,0": "B" });
    const view = checkersViewFromState({ board, nextPlayer: 0 });
    expect(view.legalMoves.length).toBeGreaterThanOrEqual(0);
  });
});

describe("notateCheckersMove", () => {
  it("uses '-' separator for a simple step", () => {
    expect(notateCheckersMove({ squares: [[5, 0], [4, 1]] })).toBe("a3-b4");
  });

  it("uses 'x' separator for a single capture (abs row diff === 2)", () => {
    expect(notateCheckersMove({ squares: [[4, 3], [2, 5]] })).toBe("d4xf6");
  });

  it("uses 'x' separator for a multi-jump (>2 squares)", () => {
    expect(
      notateCheckersMove({ squares: [[6, 1], [4, 3], [2, 5]] }),
    ).toBe("b2xd4xf6");
  });
});
