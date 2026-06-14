import type { Migration } from "./MigrationRunner.ts";
import { UserRepo } from "../repository.ts";

/**
 * UserRecord.puzzleRating (one global Glicko) became
 * UserRecord.puzzleRatings (per-game map) so puzzle leaderboards and the
 * profile Puzzles pill can report per-game elo. Nim is the only puzzle game
 * that has ever existed, so every legacy rating was earned on nim puzzles —
 * the migration moves the global rating to `puzzleRatings.nim`.
 *
 * Idempotency: only records that still carry the legacy `puzzleRating`
 * field are touched, and the rewrite removes it, so a second run is a no-op.
 * Legacy DEFAULT ratings (1500/350/0.06 with no rated attempt ever made)
 * are dropped rather than migrated: an untouched default is
 * indistinguishable from "never played", and migrating it would seed the
 * puzzle leaderboard with users who never attempted a puzzle.
 */
export const migration: Migration = {
  id: "002_per_game_puzzle_ratings",
  description:
    "Move legacy global UserRecord.puzzleRating into the per-game puzzleRatings map " +
    "(nim — the only puzzle game to date); drop untouched defaults.",
  up: async () => {
    const keys = await UserRepo.getAllKeys();
    for (const key of keys) {
      const user = await UserRepo.find(key);
      if (!user) continue;
      const legacy = (user as unknown as Record<string, unknown>)["puzzleRating"] as
        | { rating: number; rd: number; vol: number }
        | undefined;
      const hasNewMap = user.puzzleRatings !== undefined;
      if (legacy === undefined && hasNewMap) continue; // already migrated

      const { puzzleRating: _legacy, ...rest } = user as unknown as Record<string, unknown> & {
        puzzleRating?: unknown;
      };
      const isUntouchedDefault =
        legacy !== undefined && legacy.rating === 1500 && legacy.rd === 350;
      const puzzleRatings =
        user.puzzleRatings ?? (legacy !== undefined && !isUntouchedDefault ? { nim: legacy } : {});
      await UserRepo.set(key, {
        ...(rest as object),
        puzzleRatings,
      } as typeof user);
    }
  },
};
