import { describe, expect, it } from "vitest";
import { GameService } from "../../src/games/gameServiceManager.ts";
import { type GameLogic } from "../../src/games/gameLogic.ts";
import { nimGameService } from "../../src/games/nim.ts";

/* ---------------------------------------------------------------------------
 * GameService plumbing for the optional GameLogic hooks: `winnerIndex` must
 * surface on update() results only when the game is done, and `parseMove`
 * must fall back to null when the game has no parser.
 * ----------------------------------------------------------------------- */

/** Counter "game": each move increments; done at 2; no optional hooks. */
type CounterState = { count: number };
const hooklessLogic: GameLogic<CounterState, CounterState> = {
  minPlayers: 1,
  maxPlayers: 2,
  start: () => ({ count: 0 }),
  update: (state) => ({ count: state.count + 1 }),
  isDone: (state) => state.count >= 2,
  viewAs: (state) => state,
  tagView: (view) => ({ type: "nim", view: { remaining: view.count, nextPlayer: 0 } }),
};

describe("GameService.update() winnerIndex plumbing", () => {
  it("returns undefined winnerIndex while the game is not done", () => {
    const result = nimGameService.update({ remaining: 6, nextPlayer: 0 }, 3, 0, ["a", "b"]);
    expect(result).not.toBeNull();
    expect(result!.done).toBe(false);
    expect(result!.winnerIndex).toBeUndefined();
  });

  it("returns the logic's winnerIndex when the final move lands", () => {
    const result = nimGameService.update({ remaining: 3, nextPlayer: 0 }, 3, 0, ["a", "b"]);
    expect(result).not.toBeNull();
    expect(result!.done).toBe(true);
    // Misère: player 0 took the last object, so player 1 wins.
    expect(result!.winnerIndex).toBe(1);
  });

  it("returns undefined winnerIndex on done when the logic has no hook", () => {
    const service = new GameService(hooklessLogic);
    const mid = service.update({ count: 0 }, "tick", 0, ["a"]);
    expect(mid!.done).toBe(false);
    const result = service.update({ count: 1 }, "tick", 0, ["a"]);
    expect(result).not.toBeNull();
    expect(result!.done).toBe(true);
    expect(result!.winnerIndex).toBeUndefined();
  });
});

describe("GameService.parseMove() plumbing", () => {
  it("delegates to the logic's parseMove hook", () => {
    expect(nimGameService.parseMove(2)).toBe(2);
    expect(nimGameService.parseMove("nope")).toBeNull();
  });

  it("returns null when the logic has no parseMove hook", () => {
    const service = new GameService(hooklessLogic);
    expect(service.parseMove({ anything: true })).toBeNull();
  });
});
