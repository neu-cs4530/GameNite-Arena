import { describe, expect, it } from "vitest";
import {
  describePuzzleMove,
  formatEloDelta,
  mapPuzzleRecord,
  type PuzzleRecordWire,
} from "./puzzleMapper.ts";

/**
 * The wire PuzzleRecord carries `position` and `solution.moves` as unknown.
 * The mapper is the single place that narrows them to per-game shapes, so a
 * malformed payload turns into one well-defined null (→ ErrorState) instead
 * of a crash deep inside a board component.
 */

const nimWire: PuzzleRecordWire = {
  gameKey: "nim",
  date: "2026-06-10",
  position: { remaining: 6, nextPlayer: 1 },
  solution: { moves: [3, 3], explanation: "leave them the last token" },
  sourceMatchId: "match-1",
  createdAt: "2026-06-10T00:00:00.000Z",
};

const guessWire: PuzzleRecordWire = {
  gameKey: "guess",
  date: "2026-06-10",
  position: { finished: false, guesses: [true, true, false, false] },
  solution: { moves: [80, 41] },
  createdAt: "2026-06-10T00:00:00.000Z",
};

describe("mapPuzzleRecord (nim)", () => {
  it("narrows the hydrated nim position and raw solution moves", () => {
    const puzzle = mapPuzzleRecord(nimWire);
    expect(puzzle).not.toBeNull();
    expect(puzzle!.gameKey).toBe("nim");
    expect(puzzle!.date).toBe("2026-06-10");
    expect(puzzle!.position).toStrictEqual({ kind: "nim", view: { remaining: 6, nextPlayer: 1 } });
    expect(puzzle!.solutionMoves).toStrictEqual([3, 3]);
    expect(puzzle!.explanation).toBe("leave them the last token");
  });

  it("rejects the legacy {matchId, upToMoveIndex} reference encoding", () => {
    expect(
      mapPuzzleRecord({ ...nimWire, position: { matchId: "m1", upToMoveIndex: 4 } }),
    ).toBeNull();
  });

  it("rejects a puzzle with no solution moves (nothing to grade against)", () => {
    expect(mapPuzzleRecord({ ...nimWire, solution: { moves: [] } })).toBeNull();
  });
});

describe("mapPuzzleRecord (guess)", () => {
  it("narrows the unfinished watcher view", () => {
    const puzzle = mapPuzzleRecord(guessWire);
    expect(puzzle!.position).toStrictEqual({
      kind: "guess",
      view: { finished: false, guesses: [true, true, false, false] },
    });
    expect(puzzle!.solutionMoves).toStrictEqual([80, 41]);
    expect(puzzle!.explanation).toBeUndefined();
  });

  it("rejects a nim-shaped position arriving under the guess key", () => {
    expect(mapPuzzleRecord({ ...guessWire, position: nimWire.position })).toBeNull();
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
