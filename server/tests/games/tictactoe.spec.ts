import { describe, expect, it } from "vitest";
import { ticTacToeLogic } from "../../src/games/tictactoe.ts";
import { z } from "zod";
import type { TicTacToeState } from "@gamenite/shared";

const zTicTacEntry = z.union([z.literal("."), z.literal("O"), z.literal("X")]);
const zTicTacRow = z.array(zTicTacEntry).length(3);
const zBoard = z.array(zTicTacRow).length(3);

function mkState(nextPlayer: 0 | 1, boardStr: string): TicTacToeState {
  const board = zBoard.parse(boardStr.split("/").map((row) => row.split("")));
  return { board, nextPlayer };
}

function captureView(maybeView: unknown) {
  const zCoord = z.tuple([z.number(), z.number()]);
  const zWin = z.tuple([zCoord, zCoord, zCoord]);
  const zCaptureView = z.object({
    board: zBoard,
    nextPlayer: z.union([z.literal(0), z.literal(1)]),
    winningEntry: z.union([z.null(), zWin]),
  });
  const view = zCaptureView.parse(maybeView);
  return {
    next: view.nextPlayer,
    board: view.board.map((row) => row.join("")).join("/"),
    winningEntry:
      view.winningEntry &&
      view.winningEntry
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]))
        .map((entry) => `${entry[0]},${entry[1]}`)
        .join("/"),
  };
}

describe("TicTacToe's start() logic", () => {
  it("Should start a two-player game with an empty board, and player 1 next", () => {
    expect(ticTacToeLogic.start(2)).toStrictEqual(mkState(1, ".../.../..."));
  });
});

describe(`TicTacToe's update() logic`, () => {
  it("Should reject invalid inputs", () => {
    expect(ticTacToeLogic.update(mkState(1, ".../.../..."), "no", 1)).toBe(null);
    expect(ticTacToeLogic.update(mkState(1, ".../.../..."), [-1, 1], 1)).toBe(null);
    expect(ticTacToeLogic.update(mkState(0, ".../.../..."), true, 0)).toBe(null);
  });
  it("Should prevent a player from moving if it is not their turn", () => {
    expect(ticTacToeLogic.update(mkState(0, ".../.../..."), [0, 0], 1)).toBe(null);
    expect(ticTacToeLogic.update(mkState(1, ".../.../..."), [1, 1], 0)).toBe(null);
  });
  it("Should allow a player to play in any empty space", () => {
    expect(ticTacToeLogic.update(mkState(1, ".../.../..."), [0, 0], 1)).toStrictEqual(
      mkState(0, "X../.../..."),
    );
    expect(ticTacToeLogic.update(mkState(0, ".../.../..."), [1, 1], 0)).toStrictEqual(
      mkState(1, ".../.O./..."),
    );
    expect(ticTacToeLogic.update(mkState(1, "XOX/OOX/OX."), [2, 2], 1)).toStrictEqual(
      mkState(0, "XOX/OOX/OXX"),
    );
  });
  it("Should reject moves in non-empty spaces", () => {
    expect(ticTacToeLogic.update(mkState(1, "XOX/OOX/OX."), [1, 1], 1)).toBe(null);
    expect(ticTacToeLogic.update(mkState(0, "XOX/OOX/.X."), [0, 0], 0)).toBe(null);
  });
  it("Should not allow moves after a win", () => {
    expect(ticTacToeLogic.update(mkState(0, "XXX/.../..."), [2, 2], 0)).toBe(null);
    expect(ticTacToeLogic.update(mkState(1, "OOO/.../..."), [1, 1], 1)).toBe(null);
  });
});
describe(`TicTacToe's isDone() logic`, () => {
  it("Should report false when not finished", () => {
    expect(ticTacToeLogic.isDone(mkState(1, ".../.../..."))).toBe(false);
    expect(ticTacToeLogic.isDone(mkState(0, ".../.X./..."))).toBe(false);
    expect(ticTacToeLogic.isDone(mkState(1, ".O./.X./..."))).toBe(false);
    expect(ticTacToeLogic.isDone(mkState(0, ".OX/.X./..."))).toBe(false);
    expect(ticTacToeLogic.isDone(mkState(1, ".OX/.X./O.."))).toBe(false);
    expect(ticTacToeLogic.isDone(mkState(0, ".OX/.X./O.X"))).toBe(false);
    expect(ticTacToeLogic.isDone(mkState(1, "OOX/.X./O.X"))).toBe(false);
  });
  it("Should return true on a vertical win", () => {
    expect(ticTacToeLogic.isDone(mkState(0, "OOX/.XX/O.X"))).toBe(true);
  });
  it("Should return true on a horizontal win", () => {
    expect(ticTacToeLogic.isDone(mkState(0, "XXX/.../..."))).toBe(true);
  });
  it("Should return true on a diag win", () => {
    expect(ticTacToeLogic.isDone(mkState(0, "X../.X./..X"))).toBe(true);
    expect(ticTacToeLogic.isDone(mkState(1, "..O/.O./O.."))).toBe(true);
  });
  it("Should return true on a full board stalemate", () => {
    expect(ticTacToeLogic.isDone(mkState(0, "XOX/OOX/XXO"))).toBe(true);
  });
});
describe(`TicTacToe's viewAs() logic`, () => {
  it("Should pass through unfinished games", () => {
    expect(captureView(ticTacToeLogic.viewAs(mkState(0, ".OX/.X./O.X"), 0))).toStrictEqual({
      board: ".OX/.X./O.X",
      next: 0,
      winningEntry: null,
    });
  });
  it("Should report horizontal wins", () => {
    expect(captureView(ticTacToeLogic.viewAs(mkState(0, "XXX/.X./O.X"), 0))).toStrictEqual({
      board: "XXX/.X./O.X",
      next: 0,
      winningEntry: "0,0/0,1/0,2",
    });
    expect(captureView(ticTacToeLogic.viewAs(mkState(0, "OOO/.X./O.X"), 0))).toStrictEqual({
      board: "OOO/.X./O.X",
      next: 0,
      winningEntry: "0,0/0,1/0,2",
    });
  });
  it("Should report vertical wins", () => {
    expect(captureView(ticTacToeLogic.viewAs(mkState(0, "..X/..X/O.X"), 0))).toStrictEqual({
      board: "..X/..X/O.X",
      next: 0,
      winningEntry: "0,2/1,2/2,2",
    });
    expect(captureView(ticTacToeLogic.viewAs(mkState(0, "..O/..O/X.O"), 0))).toStrictEqual({
      board: "..O/..O/X.O",
      next: 0,
      winningEntry: "0,2/1,2/2,2",
    });
  });
  it("Should report diag wins", () => {
    expect(captureView(ticTacToeLogic.viewAs(mkState(0, "X.O/.XO/..X"), 0))).toStrictEqual({
      board: "X.O/.XO/..X",
      next: 0,
      winningEntry: "0,0/1,1/2,2",
    });
    expect(captureView(ticTacToeLogic.viewAs(mkState(0, "O.X/.OX/..O"), 0))).toStrictEqual({
      board: "O.X/.OX/..O",
      next: 0,
      winningEntry: "0,0/1,1/2,2",
    });
    expect(captureView(ticTacToeLogic.viewAs(mkState(0, "O.X/.XO/X.O"), 0))).toStrictEqual({
      board: "O.X/.XO/X.O",
      next: 0,
      winningEntry: "0,2/1,1/2,0",
    });
    expect(captureView(ticTacToeLogic.viewAs(mkState(0, "X.O/.OX/O.X"), 0))).toStrictEqual({
      board: "X.O/.OX/O.X",
      next: 0,
      winningEntry: "0,2/1,1/2,0",
    });
  });
});
describe(`TicTacToe's tagView() logic`, () => {
  it("Should appropriately tag the view", () => {
    expect(
      ticTacToeLogic.tagView({ ...mkState(0, ".../.../..."), winningEntry: null }),
    ).toStrictEqual({
      type: "tictactoe",
      view: {
        ...mkState(0, ".../.../..."),
        winningEntry: null,
      },
    });
  });
});
