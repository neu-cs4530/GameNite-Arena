import type { GuessMove, GuessView } from "@gamenite/shared";

/**
 * Replay-only Guess state. We don't have the live `GuessState` available here
 * because the secret is server-side; instead we keep a parallel
 * shape that we know how to advance during playback.
 */
export interface ReplayGuessState {
  secret: number;
  guesses: (number | null)[];
}

export function applyGuessMove(
  state: ReplayGuessState,
  move: GuessMove,
  playerIndex: number,
): ReplayGuessState {
  const guesses = state.guesses.slice();
  guesses[playerIndex] = move;
  return { ...state, guesses };
}

/**
 * Reveal-all view used by the replay viewer. Because we're a post-game
 * replay, we always treat the state as "finished" once everyone has guessed.
 */
export function guessViewFromState(state: ReplayGuessState, finished: boolean): GuessView {
  if (finished) {
    return {
      finished: true,
      secret: state.secret,
      guesses: state.guesses.map((g) => g ?? 0),
    };
  }
  return {
    finished: false,
    guesses: state.guesses.map((g) => g !== null),
  };
}

export function notateGuessMove(move: GuessMove): string {
  return `Guess ${move}`;
}

/**
 * Build an initial replay state given the participant count and the secret.
 * Replays may not record the secret, but our mock fixture does.
 */
export function buildInitialGuessState(participants: number, secret: number): ReplayGuessState {
  return {
    secret,
    guesses: Array<number | null>(participants).fill(null),
  };
}
