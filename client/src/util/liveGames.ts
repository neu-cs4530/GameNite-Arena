/**
 * Pure helpers for the live-games dashboard and the profile "is this user
 * live" indicator. The dashboard's raw data (BroadcastInfo) carries no game
 * type or Elo, so a hook enriches each broadcast into a LiveGameRow before
 * these run. Keeping the filter/sort/match logic pure makes it unit-testable
 * without rendering or sockets.
 */

import type { BroadcastInfo, GameKey, SafeUserInfo } from "@gamenite/shared";

/** A live broadcast enriched with its game type, players, and a filterable Elo. */
export interface LiveGameRow {
  broadcast: BroadcastInfo;
  gameKey: GameKey;
  players: SafeUserInfo[];
  /** Representative Elo (max of known human ratings), or null when unknown. */
  elo: number | null;
  /** Mirror of broadcast.startedAt, hoisted for convenient sorting. */
  startedAt: string;
}

export type LiveGameSort = "recent" | "oldest" | "highest-elo" | "lowest-elo";

export interface LiveGameFilters {
  /** Selected game keys; empty means "all games". */
  games: GameKey[];
  minElo: number;
  maxElo: number;
  sort: LiveGameSort;
}

/** The full Elo band — when the range equals this, the Elo filter is inactive. */
export const LIVE_ELO_MIN = 800;
export const LIVE_ELO_MAX = 2400;

export const defaultLiveFilters: LiveGameFilters = {
  games: [],
  minElo: LIVE_ELO_MIN,
  maxElo: LIVE_ELO_MAX,
  sort: "recent",
};

/** True when the user has narrowed the Elo band away from its full default. */
function eloFilterActive(f: LiveGameFilters): boolean {
  return f.minElo > LIVE_ELO_MIN || f.maxElo < LIVE_ELO_MAX;
}

/** Filter live games by game type + Elo band, then sort. Pure. */
export function filterAndSortLiveGames(
  rows: LiveGameRow[],
  filters: LiveGameFilters,
): LiveGameRow[] {
  const eloActive = eloFilterActive(filters);
  const kept = rows.filter((r) => {
    if (filters.games.length > 0 && !filters.games.includes(r.gameKey)) return false;
    if (eloActive) {
      // Once the band is narrowed, a game with unknown Elo can't be judged in
      // or out of range, so it's excluded from the explicit filter.
      if (r.elo === null) return false;
      if (r.elo < filters.minElo || r.elo > filters.maxElo) return false;
    }
    return true;
  });

  const sorted = [...kept];
  switch (filters.sort) {
    case "recent":
      sorted.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      break;
    case "oldest":
      sorted.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      break;
    case "highest-elo":
      sorted.sort((a, b) => eloRank(b.elo) - eloRank(a.elo));
      break;
    case "lowest-elo":
      // Unknown Elo sorts last in both directions.
      sorted.sort((a, b) => eloRankAsc(a.elo) - eloRankAsc(b.elo));
      break;
  }
  return sorted;
}

/** Unknown Elo ranks lowest for descending sorts (pushed to the end). */
function eloRank(elo: number | null): number {
  return elo ?? -Infinity;
}

/** Unknown Elo ranks highest for ascending sorts (pushed to the end). */
function eloRankAsc(elo: number | null): number {
  return elo ?? Infinity;
}

/**
 * The live broadcast (if any) that `username` is currently a human player in.
 * Used to drive the profile "currently live — watch" indicator. Matches by
 * username and ignores AI seats. Returns the first match, rows assumed
 * newest-first.
 */
export function findLiveBroadcastForUser(
  rows: LiveGameRow[],
  username: string,
): LiveGameRow | null {
  return rows.find((r) => r.players.some((p) => !p.isAi && p.username === username)) ?? null;
}
