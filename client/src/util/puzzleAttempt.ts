/**
 * Pure state machine for the daily-puzzle attempt flow:
 *
 *   idle → viewing{startedAt} → submitting → result → viewing (retry)
 *
 * The page owns the side effects (fetching, POSTing the attempt); every
 * decision — including the attempt timer — lives here so it can be unit
 * tested with an injected clock. There is deliberately no visible timer in
 * the UI: `timeMs` is measured from puzzle load to submit and only sent to
 * the server.
 */

/** The server's verdict on one attempt (mirror of the attempt endpoint). */
export interface AttemptResultView {
  success: boolean;
  /**
   * Whether this attempt moved rating/streak. Only the first UNHINTED
   * attempt of the UTC day is rated; retries and hinted attempts come back
   * `rated: false` (practice) with a zero eloDelta and the user's state
   * echoed unchanged in `newRating`/`streak`.
   */
  rated: boolean;
  eloDelta: number;
  newRating: { rating: number; rd: number; vol: number };
  streak: { current: number; best: number; lastSolvedAt?: string };
}

export type AttemptState =
  | { phase: "idle" }
  | { phase: "viewing"; startedAt: number; hintsUsed: number; error: string | null }
  | { phase: "submitting"; startedAt: number; hintsUsed: number; move: unknown; timeMs: number }
  | {
      phase: "result";
      hintsUsed: number;
      move: unknown;
      timeMs: number;
      result: AttemptResultView;
    };

export type AttemptEvent =
  | { type: "puzzleLoaded"; now: number }
  | { type: "hintRevealed" }
  | { type: "submitted"; move: unknown; now: number }
  | { type: "resolved"; result: AttemptResultView }
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
 * current phase (stale network resolutions after a reset, hint clicks with
 * no puzzle, …) leave the state untouched.
 *
 * @param state - The current attempt state.
 * @param event - What happened.
 * @returns The next attempt state.
 */
export function attemptReducer(state: AttemptState, event: AttemptEvent): AttemptState {
  switch (event.type) {
    case "puzzleLoaded":
      // A (re)load is a fresh attempt: new timer, hint count back to zero.
      return { phase: "viewing", startedAt: event.now, hintsUsed: 0, error: null };

    case "hintRevealed":
      // Only the FIRST solution move is ever revealed, so re-opening the
      // hint disclosure can never cost more than one hint.
      if (state.phase !== "viewing") return state;
      return { ...state, hintsUsed: 1 };

    case "submitted":
      if (state.phase !== "viewing") return state;
      return {
        phase: "submitting",
        startedAt: state.startedAt,
        hintsUsed: state.hintsUsed,
        move: event.move,
        timeMs: attemptTimeMs(state.startedAt, event.now),
      };

    case "resolved":
      if (state.phase !== "submitting") return state;
      return {
        phase: "result",
        hintsUsed: state.hintsUsed,
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
        hintsUsed: state.hintsUsed,
        error: event.message,
      };

    case "retried":
      // A retry restarts the timer but keeps the hint count — the hint (and
      // by now the full solution) can't be un-seen, so the next attempt is
      // honestly marked as hinted.
      if (state.phase !== "result") return state;
      return { phase: "viewing", startedAt: event.now, hintsUsed: state.hintsUsed, error: null };

    case "reset":
      return initialAttemptState;
  }
}
