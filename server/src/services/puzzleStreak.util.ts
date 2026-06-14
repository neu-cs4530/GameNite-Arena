import type { PuzzleStreakView } from "@gamenite/shared";
import type { PuzzleStreak } from "../models.ts";

/** YYYY-MM-DD for the UTC day before `ymd`. */
export function dayBefore(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Today's UTC puzzle day (YYYY-MM-DD). */
export function todayYmd(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Whether `date` (YYYY-MM-DD) is one a user may legitimately attempt right
 * now: today, or yesterday as a grace window for a session that loaded the
 * puzzle just before UTC midnight and submitted just after. Any older date
 * is refused — otherwise a client could submit a long ascending run of past
 * daily-puzzle keys in one sitting to manufacture a streak (the records are
 * never deleted), inflating both the live count and the public best.
 */
export function isAttemptableDate(date: string, today: string = todayYmd()): boolean {
  return date === today || date === dayBefore(today);
}

/**
 * The streak a user has RIGHT NOW. The stored `current` is only meaningful
 * while the chain is alive (last solve was today or yesterday); after a
 * missed day it is stale history, not a live streak. Every read path must
 * serve this derived value — never the raw record.
 */
export function effectiveStreak(
  streak: PuzzleStreak,
  today: string = todayYmd(),
): PuzzleStreakView {
  const alive =
    streak.lastSolvedAt !== undefined &&
    (streak.lastSolvedAt === today || streak.lastSolvedAt === dayBefore(today));
  return {
    current: alive ? streak.current : 0,
    best: streak.best,
    lastSolvedAt: streak.lastSolvedAt,
  };
}
