import { describe, expect, it } from "vitest";
import {
  INITIAL_SEARCH_WINDOW,
  formatElapsed,
  initialMatchmakingState,
  matchmakingReducer,
  type MatchmakingState,
} from "./matchmakingReducer.ts";

/**
 * The queue page's whole lifecycle lives in this pure reducer; the component
 * only wires sockets/timers to events. Every socket event can arrive late
 * (after found/timeout/cancel), so the terminal-state transitions are as
 * load-bearing as the happy path.
 */

const searching = (elapsedSec: number, window: number): MatchmakingState => ({
  phase: "searching",
  elapsedSec,
  window,
});

describe("matchmakingReducer", () => {
  it("starts idle", () => {
    expect(initialMatchmakingState).toEqual({ phase: "idle" });
  });

  it("join from idle starts searching at 0s with the server's initial window", () => {
    const next = matchmakingReducer(initialMatchmakingState, { type: "join" });
    expect(next).toEqual(searching(0, INITIAL_SEARCH_WINDOW));
  });

  it("ticks advance the elapsed timer one second at a time", () => {
    let state = matchmakingReducer(initialMatchmakingState, { type: "join" });
    state = matchmakingReducer(state, { type: "tick" });
    state = matchmakingReducer(state, { type: "tick" });
    state = matchmakingReducer(state, { type: "tick" });
    expect(state).toEqual(searching(3, INITIAL_SEARCH_WINDOW));
  });

  it("window updates replace the searching window without touching the timer", () => {
    const next = matchmakingReducer(searching(7, 100), { type: "window", window: 250 });
    expect(next).toEqual(searching(7, 250));
  });

  it("found while searching is terminal and carries the gameId", () => {
    const found = matchmakingReducer(searching(4, 150), { type: "found", gameId: "g1" });
    expect(found).toEqual({ phase: "found", gameId: "g1" });

    // late socket traffic can't knock us out of found
    expect(matchmakingReducer(found, { type: "tick" })).toEqual(found);
    expect(matchmakingReducer(found, { type: "window", window: 300 })).toEqual(found);
    expect(matchmakingReducer(found, { type: "timeout" })).toEqual(found);
    expect(matchmakingReducer(found, { type: "cancel" })).toEqual(found);
  });

  it("timeout while searching parks the queue in timedOut", () => {
    const next = matchmakingReducer(searching(60, 1600), { type: "timeout" });
    expect(next).toEqual({ phase: "timedOut" });
  });

  it("a re-queue from timedOut starts a fresh search (timer and window reset)", () => {
    const timedOut = matchmakingReducer(searching(60, 1600), { type: "timeout" });
    expect(matchmakingReducer(timedOut, { type: "join" })).toEqual(
      searching(0, INITIAL_SEARCH_WINDOW),
    );
  });

  it("cancel from searching returns to idle", () => {
    expect(matchmakingReducer(searching(12, 400), { type: "cancel" })).toEqual({ phase: "idle" });
  });

  it("ignores stray events outside their phase", () => {
    // idle: nothing but join means anything
    expect(matchmakingReducer(initialMatchmakingState, { type: "tick" })).toEqual(
      initialMatchmakingState,
    );
    expect(matchmakingReducer(initialMatchmakingState, { type: "window", window: 200 })).toEqual(
      initialMatchmakingState,
    );
    expect(matchmakingReducer(initialMatchmakingState, { type: "found", gameId: "g2" })).toEqual(
      initialMatchmakingState,
    );
    expect(matchmakingReducer(initialMatchmakingState, { type: "timeout" })).toEqual(
      initialMatchmakingState,
    );

    // timedOut: the server already dropped us, a late found must not navigate
    const timedOut: MatchmakingState = { phase: "timedOut" };
    expect(matchmakingReducer(timedOut, { type: "found", gameId: "g3" })).toEqual(timedOut);
    expect(matchmakingReducer(timedOut, { type: "tick" })).toEqual(timedOut);
    expect(matchmakingReducer(timedOut, { type: "window", window: 500 })).toEqual(timedOut);
  });

  it("a duplicate join while searching is a no-op (StrictMode double-effects)", () => {
    const state = searching(9, 300);
    expect(matchmakingReducer(state, { type: "join" })).toEqual(state);
  });
});

describe("formatElapsed", () => {
  it("renders mm:ss zero-padded", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(5)).toBe("00:05");
    expect(formatElapsed(59)).toBe("00:59");
    expect(formatElapsed(60)).toBe("01:00");
    expect(formatElapsed(61)).toBe("01:01");
    expect(formatElapsed(600)).toBe("10:00");
  });

  it("keeps counting minutes past the hour rather than wrapping", () => {
    expect(formatElapsed(3661)).toBe("61:01");
  });

  it("clamps negatives to zero", () => {
    expect(formatElapsed(-3)).toBe("00:00");
  });
});
