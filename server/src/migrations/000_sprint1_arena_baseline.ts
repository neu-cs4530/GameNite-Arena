import type { Migration } from "./MigrationRunner.ts";
import { GameRepo, UserRepo } from "../repository.ts";
import type { GameRecord, PuzzleStreak, UserRecord } from "../models.ts";

/**
 * Sprint 1 baseline migration. Adds all GameNite Arena fields to existing
 * User and Game documents. New repositories (ModelRepo, RatingRepo,
 * MatchRepo, etc.) need no data backfill: they start empty.
 *
 * This is the only migration that has to backfill existing starter-code data.
 * Every future migration will be much narrower (one or two field changes).
 *
 * Idempotency: every field write checks `=== undefined` before setting, so
 * running this twice is a no-op on the second run.
 */

const defaultPuzzleStreak: PuzzleStreak = { current: 0, best: 0 };

export const migration: Migration = {
  id: "000_sprint1_arena_baseline",
  description:
    "Add Arena fields (puzzle rating, streak, follows) to UserRecord and " +
    "(rated, aiPlayers) to GameRecord. New repos (model, training, deployment, " +
    "rating, match, annotation, puzzle, puzzleAttempt, broadcast, channelBlock) " +
    "are empty and need no backfill.",
  up: async () => {
    /* Backfill UserRecord with new Arena fields */
    const userKeys = await UserRepo.getAllKeys();
    for (const key of userKeys) {
      const u = (await UserRepo.find(key)) as Partial<UserRecord> | null;
      if (!u) continue;
      const needsUpdate =
        u.puzzleRatings === undefined || u.puzzleStreak === undefined || u.following === undefined;
      if (!needsUpdate) continue;

      const updated: UserRecord = {
        username: u.username!,
        display: u.display!,
        createdAt: u.createdAt!,
        puzzleRatings: u.puzzleRatings ?? {},
        puzzleStreak: u.puzzleStreak ?? { ...defaultPuzzleStreak },
        following: u.following ?? [],
        emailPrefs: u.emailPrefs,
      };
      await UserRepo.set(key, updated);
    }

    /* Backfill GameRecord with new Arena fields */
    const gameKeys = await GameRepo.getAllKeys();
    for (const key of gameKeys) {
      const g = (await GameRepo.find(key)) as Partial<GameRecord> | null;
      if (!g) continue;
      const needsUpdate = g.rated === undefined || g.aiPlayers === undefined;
      if (!needsUpdate) continue;

      const updated: GameRecord = {
        type: g.type!,
        state: g.state,
        done: g.done!,
        chat: g.chat!,
        players: g.players ?? [],
        aiPlayers: g.aiPlayers ?? [],
        rated: g.rated ?? false,
        delaySec: g.delaySec,
        invalidMoveStreaks: g.invalidMoveStreaks,
        matchId: g.matchId,
        createdAt: g.createdAt!,
        createdBy: g.createdBy!,
      };
      await GameRepo.set(key, updated);
    }
  },
};
