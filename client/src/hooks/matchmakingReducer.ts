/**
 * Pure state machine for the matchmaking queue page. The component owns only
 * wiring (socket subscriptions, the 1s interval, navigation); every decision
 * about what the queue is doing lives here so it is unit-testable without a
 * DOM or a socket.
 *
 *   idle ──join──▶ searching ──found──▶ found        (terminal)
 *                     │   ▲ └──timeout──▶ timedOut ──join──▶ searching
 *                     │   └────tick/window (self)
 *                     └──cancel──▶ idle
 *
 * Socket events can land after the machine has left `searching` (a found
 * racing a timeout, a window update racing a cancel) — stray events in the
 * wrong phase are ignored rather than trusted.
 */

/** Must match the matchmaker's starting ± rating window (server-owned). */
export const INITIAL_SEARCH_WINDOW = 100;

export type MatchmakingState =
  | { phase: "idle" }
  | { phase: "searching"; elapsedSec: number; window: number }
  | { phase: "found"; gameId: string }
  | { phase: "timedOut" };

export type MatchmakingEvent =
  | { type: "join" }
  | { type: "tick" }
  | { type: "window"; window: number }
  | { type: "found"; gameId: string }
  | { type: "timeout" }
  | { type: "cancel" };

export const initialMatchmakingState: MatchmakingState = { phase: "idle" };

export function matchmakingReducer(
  state: MatchmakingState,
  event: MatchmakingEvent,
): MatchmakingState {
  switch (event.type) {
    case "join":
      // Joining while already searching must be a no-op: StrictMode runs
      // mount effects twice, and resetting the timer would lie to the user.
      if (state.phase === "searching" || state.phase === "found") return state;
      return { phase: "searching", elapsedSec: 0, window: INITIAL_SEARCH_WINDOW };

    case "tick":
      if (state.phase !== "searching") return state;
      return { ...state, elapsedSec: state.elapsedSec + 1 };

    case "window":
      if (state.phase !== "searching") return state;
      return { ...state, window: event.window };

    case "found":
      if (state.phase !== "searching") return state;
      return { phase: "found", gameId: event.gameId };

    case "timeout":
      if (state.phase !== "searching") return state;
      return { phase: "timedOut" };

    case "cancel":
      // found is terminal — navigation to the game is already in flight.
      if (state.phase === "found") return state;
      return initialMatchmakingState;
  }
}

/** mm:ss for the elapsed-in-queue timer; minutes keep counting past 59. */
export function formatElapsed(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
