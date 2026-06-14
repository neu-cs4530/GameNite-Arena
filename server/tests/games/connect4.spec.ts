import { describe, expect, it } from "vitest";
import { connect4Logic } from "../../src/games/connect4.ts";
import { z } from "zod";
import { type Connect4State } from "@gamenite/shared";

const zConnect4Entry = z.union([z.literal("."), z.literal("R"), z.literal("Y")]);
const zConnect4Row = z.array(zConnect4Entry).length(7);
const zBoard = z.array(zConnect4Row).length(6);

function mkState(nextPlayer: 0 | 1, boardStr: string): Connect4State {
  const board = zBoard.parse(boardStr.split("/").map((row) => row.split("")));
  return { board, nextPlayer };
}

function captureView(maybeView: unknown) {
  const zCoord = z.tuple([z.number(), z.number()]);
  const zWin = z.tuple([zCoord, zCoord, zCoord, zCoord]);
  const zCaptureView = z.object({
    board: zBoard,
    nextPlayer: z.union([z.literal(0), z.literal(1)]),
    winningEntry: z.union([z.null(), zWin]),
  });
  const view = zCaptureView.parse(maybeView);
  return {
    next: view.nextPlayer,
    board: view.board.map((row) => row.join("")).join("/"),
    win:
      view.winningEntry &&
      view.winningEntry
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]))
        .map((entry) => `${entry[0]},${entry[1]}`)
        .join("/"),
  };
}

describe(`Connect 4's start() logic`, () => {
  it("Should start a two-player game with an empty board, and player 0 next", () => {
    expect(connect4Logic.start(2)).toStrictEqual(
      mkState(0, "......./......./......./......./......./......."),
    );
  });
});

describe(`Connect 4's update() logic`, () => {
  it("Should reject invalid inputs", () => {
    expect(
      connect4Logic.update(mkState(0, "......./......./......./......./......./......."), "no", 0),
    ).toBe(null);
    expect(
      connect4Logic.update(mkState(0, "......./......./......./......./......./......."), -1, 0),
    ).toBe(null);
    expect(
      connect4Logic.update(mkState(0, "......./......./......./......./......./......."), 7, 0),
    ).toBe(null);
  });

  it("Should prevent a player from moving if it is not their turn", () => {
    expect(
      connect4Logic.update(mkState(0, "......./......./......./......./......./......."), 3, 1),
    ).toBe(null);
    expect(
      connect4Logic.update(mkState(1, "......./......./......./......./......./...R..."), 3, 0),
    ).toBe(null);
  });

  it("Should drop a piece to the lowest empty row", () => {
    expect(
      connect4Logic.update(mkState(0, "......./......./......./......./......./......."), 3, 0),
    ).toStrictEqual(mkState(1, "......./......./......./......./......./...R..."));
    expect(
      connect4Logic.update(mkState(1, "......./......./......./......./......./...R..."), 3, 1),
    ).toStrictEqual(mkState(0, "......./......./......./......./...Y.../...R..."));
    expect(
      connect4Logic.update(mkState(0, "......./......./......./......./...Y.../...R..."), 3, 0),
    ).toStrictEqual(mkState(1, "......./......./......./...R.../...Y.../...R..."));
  });

  it("Should reject a move in a full column", () => {
    expect(
      connect4Logic.update(mkState(0, "...R.../...Y.../...R.../...Y.../...R.../...Y..."), 3, 0),
    ).toBe(null);
  });

  it("Should not allow moves after a win", () => {
    expect(
      connect4Logic.update(mkState(1, "......./......./......./......./...Y.../RRRR..."), 0, 1),
    ).toBe(null);
  });
});

describe(`Connect 4's isDone() logic`, () => {
  it("Should report false when not finished", () => {
    expect(
      connect4Logic.isDone(mkState(0, "......./......./......./......./......./.......")),
    ).toBe(false);
    expect(
      connect4Logic.isDone(mkState(1, "......./......./......./......./......./...R...")),
    ).toBe(false);
    expect(
      connect4Logic.isDone(mkState(0, "......./......./......./......./...Y.../...R...")),
    ).toBe(false);
    expect(
      connect4Logic.isDone(mkState(1, "......./......./......./......./..YY.../..RR...")),
    ).toBe(false);
  });

  it("Should return true on a horizontal win", () => {
    expect(
      connect4Logic.isDone(mkState(1, "......./......./......./......./...YYY./RRRR...")),
    ).toBe(true);
  });

  it("Should return true on a vertical win", () => {
    expect(
      connect4Logic.isDone(mkState(1, "......./......./R....../R....../RY...../RY..Y..")),
    ).toBe(true);
  });

  it("Should return true on a diagonal (down-right) win", () => {
    expect(
      connect4Logic.isDone(mkState(1, "......./......./R....../.RY..../YYR..../YRYR.Y.")),
    ).toBe(true);
  });

  it("Should return true on a diagonal (down-left) win", () => {
    expect(
      connect4Logic.isDone(mkState(1, "......./......./.....R./....RY./...RYY./..RYRY.")),
    ).toBe(true);
  });

  it("Should return true on a full board stalemate", () => {
    expect(
      connect4Logic.isDone(mkState(0, "RYRYRYR/YRYRYRY/RYRYRYR/YRYRYRY/RYRYRYR/YRYRYRY")),
    ).toBe(true);
  });
});

describe(`Connect 4's viewAs() logic`, () => {
  it("Should pass through unfinished games", () => {
    expect(
      captureView(
        connect4Logic.viewAs(mkState(1, "......./......./......./......./......./...R..."), 0),
      ),
    ).toStrictEqual({
      board: "......./......./......./......./......./...R...",
      next: 1,
      win: null,
    });
  });

  it("Should report horizontal wins", () => {
    expect(
      captureView(
        connect4Logic.viewAs(mkState(1, "......./......./......./......./...YYY./RRRR..."), 0),
      ),
    ).toStrictEqual({
      board: "......./......./......./......./...YYY./RRRR...",
      next: 1,
      win: "5,0/5,1/5,2/5,3",
    });
  });

  it("Should report vertical wins", () => {
    expect(
      captureView(
        connect4Logic.viewAs(mkState(1, "......./......./R....../R....../RY...../RY..Y.."), 1),
      ),
    ).toStrictEqual({
      board: "......./......./R....../R....../RY...../RY..Y..",
      next: 1,
      win: "2,0/3,0/4,0/5,0",
    });
  });

  it("Should report diagonal wins", () => {
    expect(
      captureView(
        connect4Logic.viewAs(mkState(1, "......./......./R....../.RY..../YYR..../YRYR.Y."), 0),
      ),
    ).toStrictEqual({
      board: "......./......./R....../.RY..../YYR..../YRYR.Y.",
      next: 1,
      win: "2,0/3,1/4,2/5,3",
    });
  });
});

describe(`Connect 4's tagView() logic`, () => {
  it("Should appropriately tag the view", () => {
    expect(
      connect4Logic.tagView({
        ...mkState(0, "......./......./......./......./......./......."),
        winningEntry: null,
      }),
    ).toStrictEqual({
      type: "connect4",
      view: {
        ...mkState(0, "......./......./......./......./......./......."),
        winningEntry: null,
      },
    });
  });
});
