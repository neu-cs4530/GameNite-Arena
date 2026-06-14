import type { GlickoRatingView, PuzzleAttemptResult } from "@gamenite/shared";

/**
 * Pure state machine for the daily-puzzle attempt flow:
 *
 *   idle → viewing{startedAt} → submitting → result → viewing (retry)
 *
 * The page owns the side effects (fetching, POSTing attempts and hints);
 * every decision — including the attempt timer — lives here so it can be
 * unit tested with an injected clock. There is deliberately no visible
 * timer in the UI: `timeMs` is measured from puzzle load to submit and only
 * sent to the server.
 *
 * Hints are a server round-trip now (POST /api/puzzle/:gameKey/hint records
 * the grant and forfeits the rated slot). The machine only tracks what the
 * UI needs: whether a request is in flight, and — once granted — the
 * revealed move plus the permanent `hinted` forfeit flag. There is no
 * client-side hint COUNT anywhere: the server derives hint usage from its
 * own grant log and ignores anything the client might claim.
 */

/** What the hint endpoint revealed, as the UI renders it. */
export interface PuzzleHintView {
  move: unknown;
  explanation?: string;
  // cost of the hint and your rating after it. shown so the penalty isn't a surprise
  eloDelta: number;
  newRating: GlickoRatingView;
}

export type AttemptState =
  | { phase: "idle" }
  | {
      phase: "viewing";
      startedAt: number;
      /** True once the server granted a hint — the rated slot is forfeit. */
      hinted: boolean;
      hint: PuzzleHintView | null;
      /** True while the hint POST is in flight. */
      hintPending: boolean;
      error: string | null;
    }
  | {
      phase: "submitting";
      startedAt: number;
      hinted: boolean;
      hint: PuzzleHintView | null;
      move: unknown;
      timeMs: number;
    }
  | {
      phase: "result";
      hinted: boolean;
      hint: PuzzleHintView | null;
      move: unknown;
      timeMs: number;
      result: PuzzleAttemptResult;
    };

export type AttemptEvent =
  | { type: "puzzleLoaded"; now: number }
  | { type: "hintRequested" }
  | { type: "hintReceived"; hint: PuzzleHintView }
  | { type: "hintFailed"; message: string }
  | { type: "submitted"; move: unknown; now: number }
  | { type: "resolved"; result: PuzzleAttemptResult }
  | { type: "failed"; message: string }
  | { type: "retried"; now: number }
  | { type: "reset" };

export const initialAttemptState: AttemptState = { phase: "idle" };

/**
 * Elapsed attempt time, clamped so a backwards-stepping clock can never
 * produce a negative duration.
 *
 * @param startedAt - Epoch ms when the puzzle was loaded (or retried).
 * @param now - Epoch ms at submit time.
 * @returns Milliseconds spent on the attempt.
 */
export function attemptTimeMs(startedAt: number, now: number): number {
  return Math.max(0, now - startedAt);
}

/**
 * Advances the attempt machine. Total: events that don't apply to the
 * current phase (stale network resolutions after a reset, hint grants with
 * no puzzle, …) leave the state untouched.
 *
 * @param state - The current attempt state.
 * @param event - What happened.
 * @returns The next attempt state.
 */
export function attemptReducer(state: AttemptState, event: AttemptEvent): AttemptState {
  switch (event.type) {
    case "puzzleLoaded":
      // A (re)load restarts the timer and clears LOCAL hint state. The
      // forfeit itself is server-side: if a hint was already granted today
      // the next attempt still comes back `rated: false` regardless of what
      // this client remembers.
      return {
        phase: "viewing",
        startedAt: event.now,
        hinted: false,
        hint: null,
        hintPending: false,
        error: null,
      };

    case "hintRequested":
      // Re-requesting an already-granted hint would just re-buy the same
      // forfeit — the UI keeps showing what it has.
      if (state.phase !== "viewing" || state.hinted) return state;
      return { ...state, hintPending: true };

    case "hintReceived":
      if (state.phase !== "viewing") return state;
      return { ...state, hinted: true, hint: event.hint, hintPending: false };

    case "hintFailed":
      // The grant didn't happen, so the attempt is still unhinted/rated.
      if (state.phase !== "viewing") return state;
      return { ...state, hintPending: false, error: event.message };

    case "submitted":
      if (state.phase !== "viewing") return state;
      return {
        phase: "submitting",
        startedAt: state.startedAt,
        hinted: state.hinted,
        hint: state.hint,
        move: event.move,
        timeMs: attemptTimeMs(state.startedAt, event.now),
      };

    case "resolved":
      if (state.phase !== "submitting") return state;
      return {
        phase: "result",
        hinted: state.hinted,
        hint: state.hint,
        move: state.move,
        timeMs: state.timeMs,
        result: event.result,
      };

    case "failed":
      // Network failure: back to viewing with the ORIGINAL timer (the user
      // has been looking at the position the whole time) and a message.
      if (state.phase !== "submitting") return state;
      return {
        phase: "viewing",
        startedAt: state.startedAt,
        hinted: state.hinted,
        hint: state.hint,
        hintPending: false,
        error: event.message,
      };

    case "retried":
      // A retry restarts the timer but keeps the hint — it can't be un-seen,
      // and the server-side forfeit stands either way.
      if (state.phase !== "result") return state;
      return {
        phase: "viewing",
        startedAt: event.now,
        hinted: state.hinted,
        hint: state.hint,
        hintPending: false,
        error: null,
      };

    case "reset":
      return initialAttemptState;
  }
}
