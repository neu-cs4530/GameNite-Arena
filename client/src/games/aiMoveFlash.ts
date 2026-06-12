import type { NimView, SafeUserInfo } from "@gamenite/shared";

/** What an AI seat just played, derived from two consecutive views. */
export interface AiTake {
  /** Objects taken (1-3). */
  take: number;
  /** Seat index that made the move. */
  seat: number;
}

/**
 * Works out whether the transition `prev → next` was an AI seat's move and,
 * if so, what it took. The server doesn't echo moves to watchers — but nim
 * views are rich enough to reconstruct them: the seat to move in `prev`
 * made the move, and the pile delta is the take. Used to flash the picked
 * button green so the model's choice is visible instead of instantaneous.
 */
export function deriveAiTake(
  prev: NimView | null,
  next: NimView,
  players: SafeUserInfo[],
): AiTake | null {
  if (!prev) return null;
  const take = prev.remaining - next.remaining;
  if (take < 1 || take > 3) return null;
  const seat = prev.nextPlayer;
  const mover = players[seat];
  if (!mover?.isAi) return null;
  return { take, seat };
}
