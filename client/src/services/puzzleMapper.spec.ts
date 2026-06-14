import { describe, expect, it } from "vitest";
import type { PuzzleView } from "@gamenite/shared";
import {
  describePuzzleMove,
  describeRatingChange,
  formatEloDelta,
  mapPuzzleView,
} from "./puzzleMapper.ts";

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

describe("describeRatingChange", () => {
  it("shows the signed delta on a rated attempt", () => {
    expect(describeRatingChange(true, 12)).toBe("+12 this attempt");
    expect(describeRatingChange(true, -8)).toBe("-8 this attempt");
  });

  it("says so instead of a misleading ±0 on a practice attempt", () => {
    expect(describeRatingChange(false, 0)).toBe("practice — rating unchanged");
  });
});
