import { describe, expect, it } from "vitest";
import { ticTacToeLogic } from "../../src/games/tictactoe.ts";
import { connect4Logic } from "../../src/games/connect4.ts";
import { checkersLogic } from "../../src/games/checkers.ts";
import type { TicTacToeState, Connect4State, CheckersState } from "@gamenite/shared";

/**
 * The winnerIndex + parseMove hooks the live contract requires (the IP games
 * predate them). winnerIndex is the single source of truth getWinnerId
 * delegates to for rating, so wrong values here mis-score rated games.
 */

const ROW = (...cells: string[]) => cells;

describe("tictactoe winner/parse hooks", () => {
  it("winnerIndex maps the winning mark to its player (O=0, X=1)", () => {
    const oWins: TicTacToeState = {
      board: [ROW("O", "O", "O"), ROW("X", "X", "."), ROW(".", ".", ".")] as never,
      nextPlayer: 1,
    };
    const xWins: TicTacToeState = {
      board: [ROW("X", "X", "X"), ROW("O", "O", "."), ROW(".", ".", ".")] as never,
      nextPlayer: 0,
    };
    expect(ticTacToeLogic.winnerIndex!(oWins)).toBe(0);
    expect(ticTacToeLogic.winnerIndex!(xWins)).toBe(1);
  });
  it("winnerIndex is null on a full-board draw", () => {
    const draw: TicTacToeState = {
      board: [ROW("X", "O", "X"), ROW("X", "O", "O"), ROW("O", "X", "X")] as never,
      nextPlayer: 0,
    };
    expect(ticTacToeLogic.winnerIndex!(draw)).toBeNull();
  });
  it("parseMove accepts a [row,col] tuple and rejects junk", () => {
    expect(ticTacToeLogic.parseMove!([1, 2])).toEqual([1, 2]);
    expect(ticTacToeLogic.parseMove!([3, 0])).toBeNull();
    expect(ticTacToeLogic.parseMove!("nope")).toBeNull();
  });
});

describe("connect4 winner/parse hooks", () => {
  it("winnerIndex maps the winning disc to its player (R=0, Y=1)", () => {
    const base = Array.from({ length: 6 }, () => Array(7).fill(".") as string[]);
    const rWins = base.map((r) => [...r]);
    rWins[5][0] = rWins[5][1] = rWins[5][2] = rWins[5][3] = "R";
    expect(connect4Logic.winnerIndex!({ board: rWins, nextPlayer: 1 } as Connect4State)).toBe(0);
    const yWins = base.map((r) => [...r]);
    yWins[5][0] = yWins[5][1] = yWins[5][2] = yWins[5][3] = "Y";
    expect(connect4Logic.winnerIndex!({ board: yWins, nextPlayer: 0 } as Connect4State)).toBe(1);
  });
  it("winnerIndex is null mid-game", () => {
    const board = Array.from({ length: 6 }, () => Array(7).fill(".") as string[]);
    board[5][0] = "R";
    expect(connect4Logic.winnerIndex!({ board, nextPlayer: 1 } as Connect4State)).toBeNull();
  });
  it("parseMove accepts a column index and rejects out-of-range", () => {
    expect(connect4Logic.parseMove!(3)).toBe(3);
    expect(connect4Logic.parseMove!(7)).toBeNull();
    expect(connect4Logic.parseMove!({ col: 1 })).toBeNull();
  });
});

describe("checkers winner/parse hooks", () => {
  it("winnerIndex returns the opponent when the side to move has no pieces", () => {
    // Red has no pieces left → red (player 0) to move has no moves → black wins.
    const board = Array.from({ length: 8 }, () => Array(8).fill(".") as string[]);
    board[0][1] = "B";
    const state = { board, nextPlayer: 0 } as CheckersState;
    expect(checkersLogic.winnerIndex!(state)).toBe(1);
  });
  it("winnerIndex is null at the start (both have moves)", () => {
    const start = checkersLogic.start(2);
    expect(checkersLogic.winnerIndex!(start)).toBeNull();
  });
  it("parseMove accepts a {squares} chain and rejects junk", () => {
    expect(
      checkersLogic.parseMove!({
        squares: [
          [5, 0],
          [4, 1],
        ],
      }),
    ).toEqual({
      squares: [
        [5, 0],
        [4, 1],
      ],
    });
    expect(checkersLogic.parseMove!({ squares: [[5, 0]] })).toBeNull();
    expect(checkersLogic.parseMove!(5)).toBeNull();
  });
});
