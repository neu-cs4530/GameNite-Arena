import { describe, expect, it } from "vitest";
import {
  deriveOutcome,
  extractMyChange,
  isViewDone,
  recapMode,
  resultFromReplay,
} from "./recap.ts";
import type { MatchResultView } from "./types.ts";

const win = (winnerId: string): MatchResultView => ({ winnerId, outcome: "win" });

describe("deriveOutcome", () => {
  it("says you won when the winner is you", () => {
    expect(deriveOutcome(win("me"), "me")).toEqual({ headline: "You won", tone: "success" });
  });

  it("says you lost when the winner is someone else", () => {
    expect(deriveOutcome(win("them"), "me")).toEqual({ headline: "You lost", tone: "danger" });
  });

  it("reports draws neutrally", () => {
    expect(deriveOutcome({ outcome: "draw" }, "me")).toEqual({
      headline: "Draw",
      tone: "default",
    });
  });

  it("labels forfeits honestly for both sides", () => {
    expect(deriveOutcome({ winnerId: "me", outcome: "forfeit" }, "me")).toEqual({
      headline: "You won by forfeit",
      tone: "success",
    });
    expect(deriveOutcome({ winnerId: "them", outcome: "forfeit" }, "me")).toEqual({
      headline: "You lost by forfeit",
      tone: "danger",
    });
  });

  it("labels abandoned games honestly", () => {
    expect(deriveOutcome({ outcome: "abandoned" }, "me")).toEqual({
      headline: "Game abandoned",
      tone: "default",
    });
  });

  it("stays neutral for watchers (no self id)", () => {
    expect(deriveOutcome(win("them"), null)).toEqual({ headline: "Game over", tone: "default" });
  });
});

describe("extractMyChange", () => {
  // Server contract (rating.service.ts): ratingChanges is written in
  // game.players order, the same order useSocketsForGame's players list uses.
  const result: MatchResultView = {
    winnerId: "u2",
    outcome: "win",
    ratingChanges: [
      { entityId: "u1", delta: -11.5 },
      { entityId: "u2", delta: 12.25 },
    ],
  };

  it("returns the change at the player's index", () => {
    expect(extractMyChange(result, 0)).toEqual({ entityId: "u1", delta: -11.5 });
    expect(extractMyChange(result, 1)).toEqual({ entityId: "u2", delta: 12.25 });
  });

  it("returns null for watchers and out-of-range indices", () => {
    expect(extractMyChange(result, -1)).toBeNull();
    expect(extractMyChange(result, 2)).toBeNull();
  });

  it("returns null when there are no rating changes", () => {
    expect(extractMyChange({ outcome: "abandoned" }, 0)).toBeNull();
  });
});

describe("isViewDone", () => {
  it("is false before the game starts", () => {
    expect(isViewDone(null)).toBe(false);
  });

  it("reads nim's empty pile as done", () => {
    expect(isViewDone({ type: "nim", view: { remaining: 3, nextPlayer: 0 } })).toBe(false);
    expect(isViewDone({ type: "nim", view: { remaining: 0, nextPlayer: 1 } })).toBe(true);
  });

  it("reads the guess game's finished flag", () => {
    expect(isViewDone({ type: "guess", view: { finished: false, guesses: [true, false] } })).toBe(
      false,
    );
    expect(
      isViewDone({ type: "guess", view: { finished: true, secret: 4, guesses: [3, 7] } }),
    ).toBe(true);
  });
});

describe("recapMode", () => {
  it("shows the rated recap as soon as a gameResult arrives", () => {
    expect(
      recapMode({ done: true, hasResult: true, graceElapsed: false, recoverySettled: false }),
    ).toBe("rated");
    // Even if the view lags behind the result event.
    expect(
      recapMode({ done: false, hasResult: true, graceElapsed: false, recoverySettled: false }),
    ).toBe("rated");
  });

  it("waits out the grace period before declaring a finished game casual", () => {
    expect(
      recapMode({ done: true, hasResult: false, graceElapsed: false, recoverySettled: false }),
    ).toBe("none");
    expect(
      recapMode({ done: true, hasResult: false, graceElapsed: true, recoverySettled: true }),
    ).toBe("casual");
  });

  it("keeps waiting after the grace period until the persisted-record check settles", () => {
    // Grace elapsed but the replay fetch is still in flight: a refreshed
    // rated game must not flash "casual" while we recover the record.
    expect(
      recapMode({ done: true, hasResult: false, graceElapsed: true, recoverySettled: false }),
    ).toBe("none");
  });

  it("shows nothing while the game is in progress", () => {
    expect(
      recapMode({ done: false, hasResult: false, graceElapsed: true, recoverySettled: true }),
    ).toBe("none");
  });
});

describe("resultFromReplay", () => {
  // Mirrors what GET /api/replay/:matchId returns after a rated match:
  // rating.service.ts writes ratingChanges onto the archived record in
  // game.players order, the same order the socket gameResult payload uses.
  const ratedResult: MatchResultView = {
    winnerId: "u2",
    outcome: "win",
    ratingChanges: [
      { entityId: "u1", delta: -11.5 },
      { entityId: "u2", delta: 12.25 },
    ],
  };

  it("recovers the socket-shaped result from a rated record", () => {
    expect(resultFromReplay({ rated: true, result: ratedResult })).toEqual(ratedResult);
  });

  it("returns null for casual records — they never have Glicko changes", () => {
    expect(
      resultFromReplay({ rated: false, result: { winnerId: "u1", outcome: "win" } }),
    ).toBeNull();
  });
});
