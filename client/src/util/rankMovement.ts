import type { LeaderboardEntry } from "./types.ts";

/**
 * Pure rank-movement math for the post-match recap's leaderboard strip.
 *
 * The previous rank is an honest reconstruction: we re-rank the player's
 * pre-game rating (current − delta) against the other entries' CURRENT
 * ratings. The opponent's rating moved too, so this is an approximation —
 * but it is computed from real data, not invented.
 */

export interface RankMovement {
  newRank: number;
  /** null when this was the player's first rated game (no previous rank). */
  prevRank: number | null;
  direction: "up" | "down" | "none" | "new";
  places: number;
}

/**
 * Computes how the player's rank moved with this game's rating change.
 *
 * @param entries - The full fetched leaderboard (server rank order).
 * @param myEntityId - The player's entity id (userId).
 * @param myDelta - The player's Glicko delta from this game.
 * @returns The movement, or null if the player is not on the board.
 */
export function computeRankMovement(
  entries: LeaderboardEntry[],
  myEntityId: string,
  myDelta: number,
): RankMovement | null {
  const mine = entries.find((e) => e.entityId === myEntityId);
  if (!mine) return null;

  // gamesPlayed already includes this game: 1 game = first rated game ever.
  if (mine.gamesPlayed <= 1) {
    return { newRank: mine.rank, prevRank: null, direction: "new", places: 0 };
  }

  const prevRating = mine.rating - myDelta;
  const strictlyAbove = entries.filter(
    (e) => e.entityId !== myEntityId && e.rating > prevRating,
  ).length;
  const prevRank = strictlyAbove + 1;
  const newRank = mine.rank;

  const direction = newRank < prevRank ? "up" : newRank > prevRank ? "down" : "none";
  return { newRank, prevRank, direction, places: Math.abs(prevRank - newRank) };
}

/**
 * The player's row plus up to `radius` neighbors on each side, in board
 * order — the mini strip rendered under the recap. Empty if the player is
 * not on the board.
 */
export function neighborSlice(
  entries: LeaderboardEntry[],
  myEntityId: string,
  radius = 3,
): LeaderboardEntry[] {
  const index = entries.findIndex((e) => e.entityId === myEntityId);
  if (index < 0) return [];
  return entries.slice(Math.max(0, index - radius), Math.min(entries.length, index + radius + 1));
}
