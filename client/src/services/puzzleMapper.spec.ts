import { describe, expect, it } from "vitest";
import type { PuzzleView, TrainingPackEntry } from "@gamenite/shared";
import {
  applyPuzzleMove,
  describePuzzleMove,
  describeRatingChange,
  formatEloDelta,
  mapPuzzleView,
  mapTrainingPackEntry,
} from "./puzzleMapper.ts";
import type { PuzzlePosition } from "./puzzleMapper.ts";

/**
 * The wire PuzzleView carries `position` as unknown (per-game shape). The
 * mapper is the single place that narrows it, so a malformed payload turns
 * into one well-defined null (→ ErrorState) instead of a crash deep inside
 * a board component.
 *
 * The view deliberately has NO solution field — that was the leak. Anything
 * solution-shaped arriving on the GET must not survive the mapping.
 */

const nimWire: PuzzleView = {
  gameKey: "nim",
  date: "2026-06-10",
  position: { remaining: 6, nextPlayer: 1 },
  sourceMatchId: "match-1",
  createdAt: "2026-06-10T00:00:00.000Z",
};

const guessWire: PuzzleView = {
  gameKey: "guess",
  date: "2026-06-10",
  position: { finished: false, guesses: [true, true, false, false] },
  createdAt: "2026-06-10T00:00:00.000Z",
};

const tttPosition = {
  board: [
    ["X", "X", "."],
    ["O", "O", "."],
    [".", ".", "."],
  ],
  nextPlayer: 1,
  winningEntry: null,
};

const tttWire: PuzzleView = {
  gameKey: "tictactoe",
  date: "2026-06-10",
  position: tttPosition,
  sourceMatchId: "match-2",
  createdAt: "2026-06-10T00:00:00.000Z",
};

/** Builds a 6x7 connect4 board, "." everywhere except the given squares. */
function connect4Board(pieces: Record<string, string>): string[][] {
  const board = Array.from({ length: 6 }, () => Array.from({ length: 7 }, () => "."));
  for (const [key, entry] of Object.entries(pieces)) {
    const [row, col] = key.split(",").map(Number);
    board[row][col] = entry;
  }
  return board;
}

const connect4Position = {
  board: connect4Board({ "5,0": "R", "5,1": "R", "5,2": "R" }),
  nextPlayer: 0,
  winningEntry: null,
};

const connect4Wire: PuzzleView = {
  gameKey: "connect4",
  date: "2026-06-10",
  position: connect4Position,
  sourceMatchId: "match-3",
  createdAt: "2026-06-10T00:00:00.000Z",
};

/** Builds an 8x8 checkers board, "." everywhere except the given squares. */
function checkersBoard(pieces: Record<string, string>): string[][] {
  const board = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => "."));
  for (const [key, entry] of Object.entries(pieces)) {
    const [row, col] = key.split(",").map(Number);
    board[row][col] = entry;
  }
  return board;
}

const checkersPosition = {
  board: checkersBoard({ "3,4": "B", "4,5": "R" }),
  nextPlayer: 0,
  winner: null,
  legalMoves: [
    {
      squares: [
        [4, 5],
        [2, 3],
      ],
    },
  ],
};

const checkersWire: PuzzleView = {
  gameKey: "checkers",
  date: "2026-06-10",
  position: checkersPosition,
  sourceMatchId: "match-4",
  createdAt: "2026-06-10T00:00:00.000Z",
};

describe("mapPuzzleView (nim)", () => {
  it("narrows the hydrated nim position and echoes the puzzle date", () => {
    const puzzle = mapPuzzleView(nimWire);
    expect(puzzle).not.toBeNull();
    expect(puzzle!.gameKey).toBe("nim");
    expect(puzzle!.date).toBe("2026-06-10");
    expect(puzzle!.position).toStrictEqual({ kind: "nim", view: { remaining: 6, nextPlayer: 1 } });
    expect(puzzle!.sourceMatchId).toBe("match-1");
  });

  it("defaults viewerAttempt to null on an anonymous fetch", () => {
    expect(mapPuzzleView(nimWire)!.viewerAttempt).toBeNull();
  });

  it("passes through the viewer's standing from a ?for= fetch", () => {
    const withViewer: PuzzleView = {
      ...nimWire,
      viewerAttempt: { attempted: true, solved: true, rated: true },
    };
    expect(mapPuzzleView(withViewer)!.viewerAttempt).toStrictEqual({
      attempted: true,
      solved: true,
      rated: true,
    });
  });

  it("rejects the legacy {matchId, upToMoveIndex} reference encoding", () => {
    expect(mapPuzzleView({ ...nimWire, position: { matchId: "m1", upToMoveIndex: 4 } })).toBeNull();
  });
});

describe("mapPuzzleView (guess)", () => {
  it("narrows the unfinished watcher view", () => {
    const puzzle = mapPuzzleView(guessWire);
    expect(puzzle!.position).toStrictEqual({
      kind: "guess",
      view: { finished: false, guesses: [true, true, false, false] },
    });
  });

  it("rejects a nim-shaped position arriving under the guess key", () => {
    expect(mapPuzzleView({ ...guessWire, position: nimWire.position })).toBeNull();
  });
});

describe("mapPuzzleView (tictactoe)", () => {
  it("narrows the hydrated tictactoe position", () => {
    const puzzle = mapPuzzleView(tttWire);
    expect(puzzle!.position).toStrictEqual({ kind: "tictactoe", view: tttPosition });
    expect(puzzle!.sourceMatchId).toBe("match-2");
  });

  it("rejects a position that's already won", () => {
    const won = {
      ...tttWire,
      position: {
        ...tttPosition,
        winningEntry: [
          [0, 0],
          [0, 1],
          [0, 2],
        ],
      },
    };
    expect(mapPuzzleView(won)).toBeNull();
  });

  it("rejects a board with the wrong dimensions", () => {
    const bad = { ...tttWire, position: { ...tttPosition, board: [["X", "X", "."]] } };
    expect(mapPuzzleView(bad)).toBeNull();
  });
});

describe("mapPuzzleView (connect4)", () => {
  it("narrows the hydrated connect4 position", () => {
    const puzzle = mapPuzzleView(connect4Wire);
    expect(puzzle!.position).toStrictEqual({ kind: "connect4", view: connect4Position });
    expect(puzzle!.sourceMatchId).toBe("match-3");
  });

  it("rejects a position that's already won", () => {
    const won = {
      ...connect4Wire,
      position: {
        ...connect4Position,
        winningEntry: [
          [5, 0],
          [5, 1],
          [5, 2],
          [5, 3],
        ],
      },
    };
    expect(mapPuzzleView(won)).toBeNull();
  });

  it("rejects a board with an entry outside R/Y/.", () => {
    const bad = {
      ...connect4Wire,
      position: { ...connect4Position, board: connect4Board({ "5,0": "Z" }) },
    };
    expect(mapPuzzleView(bad)).toBeNull();
  });
});

describe("mapPuzzleView (checkers)", () => {
  it("narrows the hydrated checkers position", () => {
    const puzzle = mapPuzzleView(checkersWire);
    expect(puzzle!.position).toStrictEqual({ kind: "checkers", view: checkersPosition });
    expect(puzzle!.sourceMatchId).toBe("match-4");
  });

  it("rejects a position that's already won", () => {
    const won = { ...checkersWire, position: { ...checkersPosition, winner: 0 } };
    expect(mapPuzzleView(won)).toBeNull();
  });

  it("rejects a position missing legalMoves", () => {
    const bad = { ...checkersWire, position: { ...checkersPosition, legalMoves: undefined } };
    expect(mapPuzzleView(bad)).toBeNull();
  });
});

describe("describePuzzleMove", () => {
  it("notates nim moves like the replay move list", () => {
    expect(describePuzzleMove("nim", 1)).toBe("Take 1");
    expect(describePuzzleMove("nim", 2)).toBe("Take 2");
    expect(describePuzzleMove("nim", 3)).toBe("Take 3");
  });

  it("notates guess moves", () => {
    expect(describePuzzleMove("guess", 41)).toBe("Guess 41");
  });

  it("notates tictactoe moves like the replay move list", () => {
    expect(describePuzzleMove("tictactoe", [0, 2])).toBe("C1");
  });

  it("notates connect4 moves", () => {
    expect(describePuzzleMove("connect4", 3)).toBe("Drop column 4");
  });

  it("notates checkers moves", () => {
    expect(
      describePuzzleMove("checkers", {
        squares: [
          [4, 5],
          [2, 3],
        ],
      }),
    ).toBe("f4xd6");
  });

  it("falls back to a string for anything malformed", () => {
    expect(describePuzzleMove("nim", { weird: true })).toBe(JSON.stringify({ weird: true }));
  });
});

describe("formatEloDelta", () => {
  it("signs gains and losses explicitly", () => {
    expect(formatEloDelta(12)).toBe("+12");
    expect(formatEloDelta(-8)).toBe("-8");
    expect(formatEloDelta(0)).toBe("±0");
  });
});

describe("describeRatingChange", () => {
  it("shows the signed delta on a rated attempt", () => {
    expect(describeRatingChange(true, 12)).toBe("+12 this attempt");
    expect(describeRatingChange(true, -8)).toBe("-8 this attempt");
  });

  it("says so instead of a misleading ±0 on a practice attempt", () => {
    expect(describeRatingChange(false, 0)).toBe("practice — rating unchanged");
  });
});

describe("describePuzzleMove — missing branches", () => {
  it("falls back for a nim move out of range (1-3)", () => {
    expect(describePuzzleMove("nim", 5)).toBe("5");
  });

  it("falls back when tictactoe move fails to parse", () => {
    expect(describePuzzleMove("tictactoe", "bad")).toBe(JSON.stringify("bad"));
  });

  it("falls back when connect4 move fails to parse", () => {
    expect(describePuzzleMove("connect4", "bad")).toBe(JSON.stringify("bad"));
  });

  it("falls back when checkers move fails to parse", () => {
    expect(describePuzzleMove("checkers", "bad")).toBe(JSON.stringify("bad"));
  });
});

describe("applyPuzzleMove", () => {
  const nimPos: PuzzlePosition = { kind: "nim", view: { remaining: 6, nextPlayer: 0 } };
  const tttPos: PuzzlePosition = {
    kind: "tictactoe",
    view: { board: [[".", ".", "."], [".", ".", "."], [".", ".", "."]], nextPlayer: 1, winningEntry: null },
  };
  const c4Pos: PuzzlePosition = {
    kind: "connect4",
    view: {
      board: Array.from({ length: 6 }, () => Array(7).fill(".")),
      nextPlayer: 0,
      winningEntry: null,
    },
  };
  const checkersBoard = Array.from({ length: 8 }, () => Array(8).fill("."));
  checkersBoard[4][3] = "R";
  checkersBoard[3][4] = "B";
  const checkersPos: PuzzlePosition = {
    kind: "checkers",
    view: { board: checkersBoard as never, nextPlayer: 0, winner: null, legalMoves: [] },
  };
  const guessPos: PuzzlePosition = { kind: "guess", view: { finished: false, guesses: [false, false] } };

  it("applies a valid nim move and advances remaining", () => {
    const result = applyPuzzleMove(nimPos, 3);
    expect(result.kind).toBe("nim");
    if (result.kind === "nim") expect(result.view.remaining).toBe(3);
  });

  it("returns nim position unchanged when the move fails to parse", () => {
    expect(applyPuzzleMove(nimPos, "bad")).toStrictEqual(nimPos);
  });

  it("applies a valid tictactoe move", () => {
    const result = applyPuzzleMove(tttPos, [0, 0]);
    expect(result.kind).toBe("tictactoe");
    if (result.kind === "tictactoe") expect(result.view.board[0][0]).toBe("X");
  });

  it("returns tictactoe position unchanged when move fails to parse", () => {
    expect(applyPuzzleMove(tttPos, "bad")).toStrictEqual(tttPos);
  });

  it("applies a valid connect4 move", () => {
    const result = applyPuzzleMove(c4Pos, 3);
    expect(result.kind).toBe("connect4");
  });

  it("returns connect4 position unchanged when move fails to parse", () => {
    expect(applyPuzzleMove(c4Pos, "bad")).toStrictEqual(c4Pos);
  });

  it("applies a valid checkers move", () => {
    const move = { squares: [[4, 3], [3, 4]] };
    const result = applyPuzzleMove(checkersPos, move);
    expect(result.kind).toBe("checkers");
  });

  it("returns checkers position unchanged when move fails to parse", () => {
    expect(applyPuzzleMove(checkersPos, "bad")).toStrictEqual(checkersPos);
  });

  it("returns guess position unchanged (no interactive move)", () => {
    expect(applyPuzzleMove(guessPos, 50)).toStrictEqual(guessPos);
  });
});

describe("mapTrainingPackEntry", () => {
  it("narrows a valid nim training entry", () => {
    const entry: TrainingPackEntry = {
      gameKey: "nim",
      position: { remaining: 6, nextPlayer: 0 },
      sourceMatchId: "match-x",
      createdAt: "2026-06-10T00:00:00.000Z",
    };
    const result = mapTrainingPackEntry(entry);
    expect(result).not.toBeNull();
    expect(result!.position).toStrictEqual({ kind: "nim", view: { remaining: 6, nextPlayer: 0 } });
    expect(result!.sourceMatchId).toBe("match-x");
  });

  it("returns null when the position is malformed", () => {
    const entry: TrainingPackEntry = {
      gameKey: "nim",
      position: { wrong: true },
      sourceMatchId: "match-bad",
      createdAt: "2026-06-10T00:00:00.000Z",
    };
    expect(mapTrainingPackEntry(entry)).toBeNull();
  });
});

describe("mapPuzzleView — non-record and invalid-field positions", () => {
  it("returns null when nim position is not an object", () => {
    expect(mapPuzzleView({ ...nimWire, position: "oops" })).toBeNull();
  });

  it("returns null when guess position is not an object", () => {
    expect(mapPuzzleView({ ...guessWire, position: null })).toBeNull();
  });

  it("returns null when guess guesses contains non-booleans", () => {
    expect(mapPuzzleView({ ...guessWire, position: { finished: false, guesses: [1, 2] } })).toBeNull();
  });

  it("returns null when tictactoe position is not an object", () => {
    expect(mapPuzzleView({ ...tttWire, position: 42 })).toBeNull();
  });

  it("returns null when tictactoe nextPlayer is out of range", () => {
    expect(mapPuzzleView({ ...tttWire, position: { ...tttPosition, nextPlayer: 2 } })).toBeNull();
  });

  it("returns null when connect4 position is not an object", () => {
    expect(mapPuzzleView({ ...connect4Wire, position: "bad" })).toBeNull();
  });

  it("returns null when connect4 nextPlayer is out of range", () => {
    expect(mapPuzzleView({ ...connect4Wire, position: { ...connect4Position, nextPlayer: 2 } })).toBeNull();
  });

  it("returns null when checkers position is not an object", () => {
    expect(mapPuzzleView({ ...checkersWire, position: true })).toBeNull();
  });

  it("returns null when checkers nextPlayer is out of range", () => {
    expect(mapPuzzleView({ ...checkersWire, position: { ...checkersPosition, nextPlayer: 2 } })).toBeNull();
  });

  it("returns null when checkers legalMoves is not an array", () => {
    expect(mapPuzzleView({ ...checkersWire, position: { ...checkersPosition, legalMoves: "nope" } })).toBeNull();
  });
});
