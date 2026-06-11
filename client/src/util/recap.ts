import type { TaggedGameView } from "@gamenite/shared";
import type { MatchResultView } from "./types.ts";

/**
 * Pure logic for the post-match recap. The socket `gameResult` event only
 * fires for RATED games (the server returns no MatchResult for casual ones),
 * so "a result arrived" is itself the rated/casual discriminator.
 */

export interface RecapOutcome {
  headline: string;
  tone: "success" | "danger" | "default";
}

/**
 * Derives the recap headline from the match result and the viewer's entity
 * id (their userId, recovered from their own ratingChanges entry). Watchers
 * pass null and get a neutral headline.
 */
export function deriveOutcome(result: MatchResultView, myEntityId: string | null): RecapOutcome {
  if (result.outcome === "draw") return { headline: "Draw", tone: "default" };
  if (result.outcome === "abandoned") return { headline: "Game abandoned", tone: "default" };
  if (myEntityId === null) return { headline: "Game over", tone: "default" };

  const won = result.winnerId === myEntityId;
  if (result.outcome === "forfeit") {
    return won
      ? { headline: "You won by forfeit", tone: "success" }
      : { headline: "You lost by forfeit", tone: "danger" };
  }
  return won ? { headline: "You won", tone: "success" } : { headline: "You lost", tone: "danger" };
}

/**
 * Picks the viewer's rating change out of the result.
 *
 * Server contract (rating.service.ts): `ratingChanges` is written in
 * `game.players` order — the same order the game socket's players list (and
 * therefore `userPlayerIndex` from useSocketsForGame) uses. Watchers have
 * index -1 and get null.
 */
export function extractMyChange(
  result: MatchResultView,
  userPlayerIndex: number,
): { entityId: string; delta: number } | null {
  if (!result.ratingChanges || userPlayerIndex < 0) return null;
  return result.ratingChanges[userPlayerIndex] ?? null;
}

/** Whether a game view shows a finished game (per-game knowledge lives here). */
export function isViewDone(view: TaggedGameView | null): boolean {
  if (view === null) return false;
  switch (view.type) {
    case "nim":
      return view.view.remaining === 0;
    case "guess":
      return view.view.finished;
  }
}

export type RecapMode = "rated" | "casual" | "none";

/**
 * Which recap (if any) to show. A gameResult always wins; a finished view
 * without one only counts as casual after a grace period, so rated recaps
 * never flash "casual" while the result event is in flight.
 */
export function recapMode(args: {
  done: boolean;
  hasResult: boolean;
  graceElapsed: boolean;
}): RecapMode {
  if (args.hasResult) return "rated";
  if (args.done && args.graceElapsed) return "casual";
  return "none";
}

/** Formats a Glicko delta for display: "+12" / "-12" (rounded). */
export function formatDelta(delta: number): string {
  const rounded = Math.round(delta);
  return rounded >= 0 ? `+${rounded}` : `${rounded}`;
}
