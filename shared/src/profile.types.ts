import type { GameKey } from "./game.types.ts";
import type { ReplayGameKey, ReplaySummary } from "./replay.types.ts";
import type { SafeUserInfo } from "./user.types.ts";
import type { PuzzleStreakView } from "./puzzle.types.ts";

/**
 * Wire types for `GET /api/profile/:username` — the single aggregate the
 * reworked profile page renders from. One fetch covers every pill scope
 * (General, each game, Puzzles); switching scope never refetches.
 *
 * All numbers here are REAL aggregates computed server-side from the match
 * archive, rating repo, and puzzle attempt log. Nothing is fabricated: when
 * a user has no data for a scope the fields are null/zero and clients render
 * honest empty states.
 */

/** 7 rows (Sunday..Saturday) x 24 columns (UTC hour) of match counts. */
export type HeatmapGrid = number[][];

export interface ProfileRecordStats {
  totalMatches: number;
  wins: number;
  losses: number;
  draws: number;
}

/**
 * Rating stats for one game.
 * - `current`: the live Glicko rating, null when unrated
 * - `peak`: highest rating ever reached, reconstructed by replaying the
 *   user's rated matches' `ratingChanges` in completedAt order
 * - `average`: mean post-match rating over the same walk (a "how have I
 *   typically been rated" number), null when no rated matches
 */
export interface ProfileRatingStats {
  current: number | null;
  peak: number | null;
  average: number | null;
  gamesPlayed: number;
  provisional: boolean;
}

/** The user's proudest AI: their highest-rated model, with archive W/L. */
export interface ProfileBestAi {
  modelId: string;
  displayName: string;
  gameKey: string;
  rating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
}

export interface ProfileGameSummary {
  gameKey: ReplayGameKey;
  rating: ProfileRatingStats;
  record: ProfileRecordStats;
  heatmap: HeatmapGrid;
  /** Most-viewed replay involving this user in this game, or null. */
  mostViewed: ReplaySummary | null;
}

export interface ProfileGeneralSummary {
  record: ProfileRecordStats;
  /** Highest rating across all games (peak of peaks), null when unrated. */
  peakElo: number | null;
  /** Mean of current per-game ratings, null when unrated everywhere. */
  averageElo: number | null;
  heatmap: HeatmapGrid;
  bestAi: ProfileBestAi | null;
  /** Most-viewed replay involving this user across all games, or null. */
  mostViewed: ReplaySummary | null;
}

export interface ProfilePuzzleGameStats {
  gameKey: GameKey;
  rating: number | null;
  provisional: boolean;
  attempts: number;
  solves: number;
  /** solves / attempts, 0..1, 0 when no attempts. */
  solveRate: number;
  avgTimeMs: number | null;
}

export interface ProfilePuzzleAttemptView {
  /** Puzzle day (YYYY-MM-DD), parsed from the attempt's puzzleId. */
  date: string;
  gameKey: GameKey;
  success: boolean;
  rated: boolean;
  timeMs: number;
  eloDelta: number;
  createdAt: string;
}

export interface ProfilePuzzleStats {
  /** Mean of per-game puzzle ratings, null when never rated. */
  overallRating: number | null;
  perGame: ProfilePuzzleGameStats[];
  /** Effective streak — `current` is already zeroed if the chain broke. */
  streak: PuzzleStreakView;
  /** Most recent attempts, newest first (capped at 20). */
  recentAttempts: ProfilePuzzleAttemptView[];
}

export interface ProfileSummary {
  user: SafeUserInfo;
  general: ProfileGeneralSummary;
  /** One entry per game the user has matches OR a rating in. */
  perGame: ProfileGameSummary[];
  puzzles: ProfilePuzzleStats;
}
