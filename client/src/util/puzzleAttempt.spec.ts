import { describe, expect, it } from "vitest";
import type { PuzzleAttemptResult } from "@gamenite/shared";
import {
  attemptReducer,
  attemptTimeMs,
  initialAttemptState,
  type AttemptState,
} from "./puzzleAttempt.ts";

/**
 * The attempt flow is a pure state machine so the whole puzzle-card
 * lifecycle (timer included) is unit-testable with an injected clock:
 *
 *   idle → viewing{startedAt} → submitting → result → viewing (retry)
 *
 * Hints are now a server round-trip (POST /api/puzzle/:gameKey/hint): the
 * machine tracks the request in flight and, once granted, the permanent
 * hinted/forfeited state — there is no client-side hint COUNT anywhere (the
 * server derives hint usage from its own grant log).
 */

const RESULT: PuzzleAttemptResult = {
  success: true,
  rated: true,
  eloDelta: 12,
  newRating: { rating: 1512, rd: 290, vol: 0.06 },
  streak: { current: 3, best: 5, lastSolvedAt: "2026-06-10" },
  solutionMove: 3,
  explanation: "Take 3 to leave them the last token.",
};

/**
 * A practice verdict: the server grades retries and hinted attempts but
 * freezes rating and streak — `rated: false`, eloDelta always 0. The UI shows
 * "practice — rating unchanged" instead of a delta for these.
 */
const practiceResult: PuzzleAttemptResult = {
  ...RESULT,
  rated: false,
  eloDelta: 0,
};

const HINT = {
  move: 3,
  explanation: "Leave a multiple of four plus one.",
  eloDelta: -5,
  newRating: { rating: 1495, rd: 350, vol: 0.06 },
};

function viewingAt(now: number): AttemptState {
  return attemptReducer(initialAttemptState, { type: "puzzleLoaded", now });
}

function hintedViewingAt(now: number): AttemptState {
  let state = attemptReducer(viewingAt(now), { type: "hintRequested" });
  state = attemptReducer(state, { type: "hintReceived", hint: HINT });
  return state;
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

  it("starts the timer when the puzzle loads, unhinted", () => {
    expect(viewingAt(1_000)).toStrictEqual({
      phase: "viewing",
      startedAt: 1_000,
      hinted: false,
      hint: null,
      hintPending: false,
      error: null,
    });
  });

  it("a re-load restarts the timer and clears local hint state (the server still remembers the grant)", () => {
    const state = attemptReducer(hintedViewingAt(1_000), { type: "puzzleLoaded", now: 9_000 });
    expect(state).toStrictEqual({
      phase: "viewing",
      startedAt: 9_000,
      hinted: false,
      hint: null,
      hintPending: false,
      error: null,
    });
  });
});

describe("attemptReducer: hints (server-granted)", () => {
  it("marks the hint request in flight", () => {
    const state = attemptReducer(viewingAt(1_000), { type: "hintRequested" });
    expect(state).toStrictEqual({
      phase: "viewing",
      startedAt: 1_000,
      hinted: false,
      hint: null,
      hintPending: true,
      error: null,
    });
  });

  it("a granted hint permanently marks the attempt hinted (rated slot forfeit)", () => {
    expect(hintedViewingAt(1_000)).toStrictEqual({
      phase: "viewing",
      startedAt: 1_000,
      hinted: true,
      hint: HINT,
      hintPending: false,
      error: null,
    });
  });

  it("a failed hint request leaves the attempt unhinted with an error", () => {
    let state = attemptReducer(viewingAt(1_000), { type: "hintRequested" });
    state = attemptReducer(state, { type: "hintFailed", message: "Network error" });
    expect(state).toStrictEqual({
      phase: "viewing",
      startedAt: 1_000,
      hinted: false,
      hint: null,
      hintPending: false,
      error: "Network error",
    });
  });

  it("re-requesting an already-granted hint is a no-op", () => {
    const hinted = hintedViewingAt(1_000);
    expect(attemptReducer(hinted, { type: "hintRequested" })).toStrictEqual(hinted);
  });

  it("hint events are no-ops outside the viewing phase", () => {
    expect(attemptReducer(initialAttemptState, { type: "hintRequested" })).toStrictEqual(
      initialAttemptState,
    );
    expect(attemptReducer(initialAttemptState, { type: "hintReceived", hint: HINT })).toStrictEqual(
      initialAttemptState,
    );
  });
});

describe("attemptReducer: submitting", () => {
  it("captures the move, hinted flag, and elapsed time at submit", () => {
    const state = attemptReducer(hintedViewingAt(1_000), {
      type: "submitted",
      move: 3,
      now: 7_250,
    });
    expect(state).toStrictEqual({
      phase: "submitting",
      startedAt: 1_000,
      hinted: true,
      hint: HINT,
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
      hinted: false,
      hint: null,
      move: 3,
      timeMs: 1_000,
      result: RESULT,
    });
  });

  it("carries a practice verdict (rated: false) through to the result phase untouched", () => {
    let state = attemptReducer(viewingAt(1_000), { type: "submitted", move: 3, now: 2_000 });
    state = attemptReducer(state, { type: "resolved", result: practiceResult });
    expect(state.phase).toBe("result");
    expect(state.phase === "result" && state.result.rated).toBe(false);
    expect(state.phase === "result" && state.result.eloDelta).toBe(0);
  });

  it("drops a stale resolve that arrives after a reset (game switch)", () => {
    let state = attemptReducer(viewingAt(1_000), { type: "submitted", move: 3, now: 2_000 });
    state = attemptReducer(state, { type: "reset" });
    expect(attemptReducer(state, { type: "resolved", result: RESULT })).toStrictEqual({
      phase: "idle",
    });
  });

  it("returns to viewing with the original timer, hint intact, and an error when the network fails", () => {
    let state = attemptReducer(hintedViewingAt(1_000), { type: "submitted", move: 2, now: 3_000 });
    state = attemptReducer(state, { type: "failed", message: "Network error" });
    expect(state).toStrictEqual({
      phase: "viewing",
      startedAt: 1_000,
      hinted: true,
      hint: HINT,
      hintPending: false,
      error: "Network error",
    });
  });
});

describe("attemptReducer: retry", () => {
  function hintedResultState(): AttemptState {
    const state = attemptReducer(hintedViewingAt(1_000), {
      type: "submitted",
      move: 3,
      now: 2_000,
    });
    return attemptReducer(state, { type: "resolved", result: practiceResult });
  }

  it("resets the timer but keeps the hinted forfeit (a hint can't be un-seen)", () => {
    const state = attemptReducer(hintedResultState(), { type: "retried", now: 60_000 });
    expect(state).toStrictEqual({
      phase: "viewing",
      startedAt: 60_000,
      hinted: true,
      hint: HINT,
      hintPending: false,
      error: null,
    });
  });

  it("is a no-op before there is a result", () => {
    const state = viewingAt(1_000);
    expect(attemptReducer(state, { type: "retried", now: 2_000 })).toStrictEqual(state);
  });

  it("reset returns to idle from any phase", () => {
    expect(attemptReducer(hintedResultState(), { type: "reset" })).toStrictEqual({ phase: "idle" });
    expect(attemptReducer(viewingAt(1_000), { type: "reset" })).toStrictEqual({ phase: "idle" });
  });
});
