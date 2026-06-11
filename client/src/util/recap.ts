import type { TaggedGameView } from "@gamenite/shared";
import type { MatchResultView, ReplayDetail } from "./types.ts";

/**
 * Pure logic for the post-match recap. The socket `gameResult` event only
 * fires for RATED games (the server returns no MatchResult for casual ones),
 * but it is a one-shot: a refresh or late join after the final move never
 * sees it. The persisted match record (`GET /api/replay/:matchId`) is the
 * durable source of truth, so a finished game with no socket result falls
 * back to it via {@link resultFromReplay} before being declared casual.
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
 * without one only counts as casual after BOTH the grace period has passed
 * (the live result event may be in flight) AND the persisted-record check
 * has settled (a refreshed rated game recovers its result from the replay
 * archive). Rated recaps therefore never flash "casual" first.
 */
export function recapMode(args: {
  done: boolean;
  hasResult: boolean;
  graceElapsed: boolean;
  recoverySettled: boolean;
}): RecapMode {
  if (args.hasResult) return "rated";
  if (args.done && args.graceElapsed && args.recoverySettled) return "casual";
  return "none";
}

/**
 * Recovers the socket `gameResult` payload from a persisted replay record
 * (`GET /api/replay/:matchId`, where matchId === gameId). The server writes
 * `result.ratingChanges` onto the archived record in `game.players` order
 * (rating.service.ts) — the same order the live socket payload uses — so the
 * recovered result renders through RecapPanel identically.
 *
 * @returns the result for rated records, or null for casual ones (casual
 * games never change Glicko, so there is nothing to recap).
 */
export function resultFromReplay(
  replay: Pick<ReplayDetail, "rated" | "result">,
): MatchResultView | null {
  return replay.rated ? replay.result : null;
}

/** Formats a Glicko delta for display: "+12" / "-12" (rounded). */
export function formatDelta(delta: number): string {
  const rounded = Math.round(delta);
  return rounded >= 0 ? `+${rounded}` : `${rounded}`;
}
