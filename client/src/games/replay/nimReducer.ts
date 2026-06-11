import type { NimMove, NimState, NimView } from "@gamenite/shared";

/** Default starting pile size for replays whose original state isn't recorded. */
export const NIM_DEFAULT_START = 21;

/** Apply one Nim move to produce the next state. Pure / total. */
export function applyNimMove(state: NimState, move: NimMove): NimState {
  return {
    remaining: Math.max(0, state.remaining - move),
    nextPlayer: 1 - state.nextPlayer,
  };
}

/**
 * Omniscient view for replays — Nim is perfect information so view == state.
 */
export function nimViewFromState(state: NimState): NimView {
  return state;
}

/** Human-readable summary used by the move list. */
export function notateNimMove(move: NimMove): string {
  if (move === 1) return "Take 1";
  if (move === 2) return "Take 2";
  return "Take 3";
}
