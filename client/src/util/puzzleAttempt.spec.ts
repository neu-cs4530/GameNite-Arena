import { describe, expect, it } from "vitest";
import {
  attemptReducer,
  attemptTimeMs,
  initialAttemptState,
  type AttemptResultView,
  type AttemptState,
} from "./puzzleAttempt.ts";

/**
 * The attempt flow is a pure state machine so the whole puzzle-card
 * lifecycle (timer included) is unit-testable with an injected clock:
 *
 *   idle → viewing{startedAt} → submitting → result → viewing (retry)
 */

const RESULT: AttemptResultView = {
  success: true,
  eloDelta: 12,
  newRating: { rating: 1512, rd: 290, vol: 0.06 },
  streak: { current: 3, best: 5, lastSolvedAt: "2026-06-10" },
};

function viewingAt(now: number): AttemptState {
  return attemptReducer(initialAttemptState, { type: "puzzleLoaded", now });
}

describe("attemptTimeMs", () => {
  it("measures from puzzle load to submit with the injected clock", () => {
    expect(attemptTimeMs(1_000, 4_500)).toBe(3_500);
  });

  it("clamps a backwards clock to zero", () => {
    expect(attemptTimeMs(5_000, 4_000)).toBe(0);
  });
});

describe("attemptReducer: loading", () => {
  it("starts idle", () => {
    expect(initialAttemptState).toStrictEqual({ phase: "idle" });
  });

  it("starts the timer when the puzzle loads", () => {
    expect(viewingAt(1_000)).toStrictEqual({
      phase: "viewing",
      startedAt: 1_000,
      hintsUsed: 0,
      error: null,
    });
  });

  it("treats a re-load as a fresh attempt (new timer, hint forgotten)", () => {
    let state = viewingAt(1_000);
    state = attemptReducer(state, { type: "hintRevealed" });
    state = attemptReducer(state, { type: "puzzleLoaded", now: 9_000 });
    expect(state).toStrictEqual({ phase: "viewing", startedAt: 9_000, hintsUsed: 0, error: null });
  });
});

describe("attemptReducer: hints", () => {
  it("revealing the hint counts exactly one hint", () => {
    const state = attemptReducer(viewingAt(1_000), { type: "hintRevealed" });
    expect(state.phase).toBe("viewing");
    expect(state.phase === "viewing" && state.hintsUsed).toBe(1);
  });

  it("re-opening the hint never counts twice (only the first move is ever shown)", () => {
    let state = attemptReducer(viewingAt(1_000), { type: "hintRevealed" });
    state = attemptReducer(state, { type: "hintRevealed" });
    expect(state.phase === "viewing" && state.hintsUsed).toBe(1);
  });

  it("is a no-op outside the viewing phase", () => {
    expect(attemptReducer(initialAttemptState, { type: "hintRevealed" })).toStrictEqual(
      initialAttemptState,
    );
  });
});

describe("attemptReducer: submitting", () => {
  it("captures the move, hint count, and elapsed time at submit", () => {
    let state = attemptReducer(viewingAt(1_000), { type: "hintRevealed" });
    state = attemptReducer(state, { type: "submitted", move: 3, now: 7_250 });
    expect(state).toStrictEqual({
      phase: "submitting",
      startedAt: 1_000,
      hintsUsed: 1,
      move: 3,
      timeMs: 6_250,
    });
  });

  it("ignores a submit when no puzzle is loaded", () => {
    expect(
      attemptReducer(initialAttemptState, { type: "submitted", move: 1, now: 5 }),
    ).toStrictEqual(initialAttemptState);
  });

  it("lands on the result when the server resolves", () => {
    let state = attemptReducer(viewingAt(1_000), { type: "submitted", move: 3, now: 2_000 });
    state = attemptReducer(state, { type: "resolved", result: RESULT });
    expect(state).toStrictEqual({
      phase: "result",
      hintsUsed: 0,
      move: 3,
      timeMs: 1_000,
      result: RESULT,
    });
  });

  it("drops a stale resolve that arrives after a reset (game switch)", () => {
    let state = attemptReducer(viewingAt(1_000), { type: "submitted", move: 3, now: 2_000 });
    state = attemptReducer(state, { type: "reset" });
    expect(attemptReducer(state, { type: "resolved", result: RESULT })).toStrictEqual({
      phase: "idle",
    });
  });

  it("returns to viewing with the original timer and an error when the network fails", () => {
    let state = attemptReducer(viewingAt(1_000), { type: "hintRevealed" });
    state = attemptReducer(state, { type: "submitted", move: 2, now: 3_000 });
    state = attemptReducer(state, { type: "failed", message: "Network error" });
    expect(state).toStrictEqual({
      phase: "viewing",
      startedAt: 1_000,
      hintsUsed: 1,
      error: "Network error",
    });
  });
});

describe("attemptReducer: retry", () => {
  function resultState(): AttemptState {
    let state = attemptReducer(viewingAt(1_000), { type: "hintRevealed" });
    state = attemptReducer(state, { type: "submitted", move: 3, now: 2_000 });
    return attemptReducer(state, { type: "resolved", result: RESULT });
  }

  it("resets the timer but keeps the hint count (a hint can't be un-seen)", () => {
    const state = attemptReducer(resultState(), { type: "retried", now: 60_000 });
    expect(state).toStrictEqual({
      phase: "viewing",
      startedAt: 60_000,
      hintsUsed: 1,
      error: null,
    });
  });

  it("is a no-op before there is a result", () => {
    const state = viewingAt(1_000);
    expect(attemptReducer(state, { type: "retried", now: 2_000 })).toStrictEqual(state);
  });

  it("reset returns to idle from any phase", () => {
    expect(attemptReducer(resultState(), { type: "reset" })).toStrictEqual({ phase: "idle" });
    expect(attemptReducer(viewingAt(1_000), { type: "reset" })).toStrictEqual({ phase: "idle" });
  });
});
