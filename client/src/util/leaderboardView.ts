import type { LeaderboardEntry, LeaderboardSort } from "./types.ts";

/**
 * Pure view logic for the leaderboards tab. The server owns the rating
 * order (its `rank` field); everything else — alternate sorts, name search,
 * pagination — happens client-side over the full fetched board so it can be
 * unit-tested without rendering.
 */

/** How to read each non-rating sort key off an entry (all sort descending). */
const sortValue: Record<Exclude<LeaderboardSort, "rating">, (e: LeaderboardEntry) => number> = {
  winRate: (e) => e.winRate,
  wins: (e) => e.wins,
  gamesPlayed: (e) => e.gamesPlayed,
};

/**
 * Applies the board controls to the server's entries: name search first,
 * then sort. "rating" keeps the server order; other keys sort descending
 * with the server rank as a stable tie-breaker. Never mutates the input.
 */
export function applyBoardView(
  entries: LeaderboardEntry[],
  view: { sort: LeaderboardSort; search: string },
): LeaderboardEntry[] {
  const needle = view.search.trim().toLowerCase();
  const filtered =
    needle === ""
      ? [...entries]
      : entries.filter(
          (e) =>
            e.displayName.toLowerCase().includes(needle) ||
            (e.username !== undefined && e.username.toLowerCase().includes(needle)),
        );

  if (view.sort === "rating") return filtered;

  const value = sortValue[view.sort];
  return filtered.sort((a, b) => value(b) - value(a) || a.rank - b.rank);
}

/**
 * Finds the signed-in user's row. Humans only — display names are not
 * unique, but usernames are, so this matches on the entry's username.
 */
export function findSelfEntry(
  entries: LeaderboardEntry[],
  username: string,
): LeaderboardEntry | null {
  return entries.find((e) => e.entityType === "human" && e.username === username) ?? null;
}

/** Formats a 0..1 win-rate fraction as a whole percentage ("67%"). */
export function formatWinRate(winRate: number): string {
  return `${Math.round(winRate * 100)}%`;
}

/** One 1-indexed page of an already-filtered list. */
export function pageSlice<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

/** Number of pages needed; always at least one so Pagination math stays sane. */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
