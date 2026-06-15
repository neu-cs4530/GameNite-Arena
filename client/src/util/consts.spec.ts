import { describe, expect, it } from "vitest";
import { PLAYABLE_GAME_KEYS, PUZZLE_GAME_KEYS } from "./consts.ts";

/**
 * The puzzles tab renders from PUZZLE_GAME_KEYS, a deliberate subset of the
 * playable games: a game only qualifies when its daily position is deducible
 * (the board alone contains everything needed to find the winning move).
 */
describe("PUZZLE_GAME_KEYS", () => {
  it("is a subset of the playable games", () => {
    for (const key of PUZZLE_GAME_KEYS) {
      expect(PLAYABLE_GAME_KEYS).toContain(key);
    }
  });

  it("excludes guess — its watcher view shows who guessed, never the values", () => {
    expect(PUZZLE_GAME_KEYS).not.toContain("guess");
    expect(PUZZLE_GAME_KEYS).toContain("nim");
  });

  it("includes tictactoe, connect4, and checkers - their boards are fully visible", () => {
    expect(PUZZLE_GAME_KEYS).toContain("tictactoe");
    expect(PUZZLE_GAME_KEYS).toContain("connect4");
    expect(PUZZLE_GAME_KEYS).toContain("checkers");
  });
});
