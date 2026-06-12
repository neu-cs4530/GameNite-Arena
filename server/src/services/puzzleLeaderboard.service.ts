import type {
  GameKey,
  PuzzleLeaderboardEntry,
  PuzzleLeaderboardScope,
  PuzzleLeaderboardPage,
} from "@gamenite/shared";
import type { GlickoRating } from "../models.ts";
import { PuzzleAttemptRepo, UserRepo } from "../repository.ts";
import { isProvisional } from "./glicko2.service.ts";
import { effectiveStreak } from "./puzzleStreak.util.ts";
import { createRedisConnection } from "./redis.ts";

// 5 minutes — same freshness/cost tradeoff as the match leaderboard
const PUZZLE_LEADERBOARD_CACHE_SECONDS = 300;

// cap the cached board like the match leaderboard does
const MAX_PUZZLE_LEADERBOARD_ENTRIES = 100;

// Distinct from the match leaderboard's `leaderboard:<game>:<type>` family so
// the two caches can never collide.
function cacheKey(scope: PuzzleLeaderboardScope): string {
  return `puzzleLeaderboard:${scope}`;
}

/**
 * Counts puzzle attempts and solves per user by scanning the attempt log.
 * The attempt's game is parsed from its puzzleId prefix (`<gameKey>:<date>`).
 * A scan per cache fill is fine: this only runs when the 5-minute cached
 * board is rebuilt, never per request.
 */
async function tallyAttempts(
  scope: PuzzleLeaderboardScope,
): Promise<Map<string, { attempts: number; solves: number }>> {
  const tallies = new Map<string, { attempts: number; solves: number }>();
  const keys = await PuzzleAttemptRepo.getAllKeys();
  if (keys.length === 0) return tallies;

  const attempts = await PuzzleAttemptRepo.getMany(keys);
  for (const attempt of attempts) {
    const attemptGame = attempt.puzzleId.split(":")[0];
    if (scope !== "overall" && attemptGame !== scope) continue;
    const tally = tallies.get(attempt.attemptedBy.id) ?? { attempts: 0, solves: 0 };
    tally.attempts += 1;
    if (attempt.success) tally.solves += 1;
    tallies.set(attempt.attemptedBy.id, tally);
  }
  return tallies;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Resolves one user's rating for a scope: the per-game Glicko for a game
 * scope, or the mean across every game they're rated in for "overall".
 * Returns null when the user has never earned a rating in scope — such users
 * are not ranked (an unearned default would flood the board).
 */
function scopedRating(
  ratings: Partial<Record<GameKey, GlickoRating>>,
  scope: PuzzleLeaderboardScope,
): GlickoRating | null {
  if (scope !== "overall") return ratings[scope] ?? null;

  const all = Object.values(ratings).filter((r): r is GlickoRating => r !== undefined);
  if (all.length === 0) return null;
  return {
    rating: mean(all.map((r) => r.rating)),
    rd: mean(all.map((r) => r.rd)),
    vol: mean(all.map((r) => r.vol)),
  };
}

// builds the sorted board once and stores it in Redis; subsequent calls within
// the cache window just deserialize the string instead of rescanning the repos
async function fetchSortedEntries(
  scope: PuzzleLeaderboardScope,
): Promise<PuzzleLeaderboardEntry[]> {
  const redis = createRedisConnection();

  try {
    const cached = await redis.get(cacheKey(scope));
    if (cached) return JSON.parse(cached) as PuzzleLeaderboardEntry[];

    const userKeys = await UserRepo.getAllKeys();
    const users = userKeys.length > 0 ? await UserRepo.getMany(userKeys) : [];
    const tallies = await tallyAttempts(scope);

    const entries: PuzzleLeaderboardEntry[] = [];
    users.forEach((user, index) => {
      const rating = scopedRating(user.puzzleRatings ?? {}, scope);
      if (rating === null) return;

      const tally = tallies.get(userKeys[index]) ?? { attempts: 0, solves: 0 };
      const streak = effectiveStreak(user.puzzleStreak ?? { current: 0, best: 0 });
      entries.push({
        rank: 0, // assigned after sorting
        username: user.username,
        displayName: user.display,
        rating: rating.rating,
        provisional: isProvisional({
          rating: rating.rating,
          rd: rating.rd,
          volatility: rating.vol,
        }),
        attempts: tally.attempts,
        solves: tally.solves,
        solveRate: tally.attempts > 0 ? tally.solves / tally.attempts : 0,
        streakCurrent: streak.current,
        streakBest: streak.best,
      });
    });

    entries.sort((a, b) => b.rating - a.rating);
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    const topEntries = entries.slice(0, MAX_PUZZLE_LEADERBOARD_ENTRIES);
    await redis.set(
      cacheKey(scope),
      JSON.stringify(topEntries),
      "EX",
      PUZZLE_LEADERBOARD_CACHE_SECONDS,
    );
    return topEntries;
  } finally {
    await redis.quit();
  }
}

/**
 * Returns a paginated puzzle leaderboard for one game, or for "overall"
 * (every user's mean across the games they're puzzle-rated in). Built from
 * UserRepo (ratings + streaks) and PuzzleAttemptRepo (attempts/solves),
 * Redis-cached for five minutes per scope.
 *
 * @param args.scope - A GameKey, or "overall" for the blended board.
 * @param args.page - 1-indexed page number (clamped to >= 1, default 1).
 * @param args.limit - Entries per page (clamped to 1..100, default 50).
 * @returns A PuzzleLeaderboardPage with ranked entries and pagination metadata.
 */
export async function getPuzzleLeaderboard(args: {
  scope: PuzzleLeaderboardScope;
  page?: number;
  limit?: number;
}): Promise<PuzzleLeaderboardPage> {
  const page = Math.max(1, args.page ?? 1);
  const limit = Math.min(100, Math.max(1, args.limit ?? 50));

  const sortedEntries = await fetchSortedEntries(args.scope);
  const startIndex = (page - 1) * limit;

  return {
    scope: args.scope,
    entries: sortedEntries.slice(startIndex, startIndex + limit),
    page,
    pageSize: limit,
    total: sortedEntries.length,
  };
}

/**
 * Drops the cached puzzle leaderboard for a game AND the overall blend (which
 * always contains that game's ratings) so the next request rebuilds both.
 * Called by submitAttempt whenever a rated attempt moves a rating.
 *
 * @param gameKey - The game whose rated standings just changed.
 */
export async function invalidatePuzzleLeaderboardCache(gameKey: GameKey): Promise<void> {
  const redis = createRedisConnection();
  try {
    await redis.del(cacheKey(gameKey), cacheKey("overall"));
  } finally {
    await redis.quit();
  }
}
