import type { GameKey } from "@gamenite/shared";
import { isProvisional } from "./glicko2.service.ts";
import { ModelRepo, RatingRepo, UserRepo } from "../repository.ts";
import { createRedisConnection } from "./redis.ts";

// 5 minutes — fresh enough for a leaderboard, stale enough to not hammer the DB
const LEADERBOARD_CACHE_SECONDS = 300;

// spec calls for top 100 per game
const MAX_LEADERBOARD_ENTRIES = 100;

export interface LeaderboardEntry {
  rank: number;
  entityId: string;
  entityType: "human" | "ai";
  displayName: string;
  rating: number;
  rd: number;
  gamesPlayed: number;
  provisional: boolean;
}

export interface LeaderboardPage {
  gameKey: GameKey;
  entityType: "human" | "ai" | "all";
  page: number;
  limit: number;
  total: number;
  entries: LeaderboardEntry[];
}

// looks up the display name for one entry; falls back to the raw id if the record is gone
async function resolveDisplayName(entityId: string, entityType: "human" | "ai"): Promise<string> {
  try {
    if (entityType === "human") {
      const user = await UserRepo.get(entityId);
      return user.display;
    } else {
      const model = await ModelRepo.get(entityId);
      return model.displayName;
    }
  } catch {
    // entity deleted after its rating was written
    return entityId;
  }
}

// builds the sorted list once and stores it in Redis; subsequent calls within the
// cache window just deserialize the string instead of rescanning the repo
async function fetchSortedEntries(
  gameKey: GameKey,
  entityType: "human" | "ai" | "all",
): Promise<LeaderboardEntry[]> {
  const redis = createRedisConnection();
  const cacheKey = `leaderboard:${gameKey}:${entityType}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as LeaderboardEntry[];

    // RatingRecord keys are stored as  <entityType>:<entityId>:<gameKey>
    const allKeys = await RatingRepo.getAllKeys();
    const matchingKeys = allKeys.filter((key) => {
      const parts = key.split(":");
      const recordEntityType = parts[0];
      const recordGameKey = parts[parts.length - 1];
      const typeMatches = entityType === "all" || recordEntityType === entityType;
      return recordGameKey === gameKey && typeMatches;
    });

    if (matchingKeys.length === 0) {
      await redis.set(cacheKey, "[]", "EX", LEADERBOARD_CACHE_SECONDS);
      return [];
    }

    const records = await RatingRepo.getMany(matchingKeys);

    const entries: LeaderboardEntry[] = await Promise.all(
      records.map(async (record, index) => ({
        rank: index + 1, // will be overwritten after sorting
        entityId: record.entityId,
        entityType: record.entityType,
        displayName: await resolveDisplayName(record.entityId, record.entityType),
        rating: record.rating,
        rd: record.rd,
        gamesPlayed: record.gamesPlayed,
        provisional: isProvisional({
          rating: record.rating,
          rd: record.rd,
          volatility: record.vol,
        }),
      })),
    );

    entries.sort((a, b) => b.rating - a.rating);
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    const topEntries = entries.slice(0, MAX_LEADERBOARD_ENTRIES);
    await redis.set(cacheKey, JSON.stringify(topEntries), "EX", LEADERBOARD_CACHE_SECONDS);
    return topEntries;
  } finally {
    await redis.quit();
  }
}

/**
 * Returns a paginated leaderboard for one game.
 *
 * @param args.gameKey - Which game to query.
 * @param args.entityType - "human", "ai", or "all" (default "all").
 * @param args.page - 1-indexed page number (default 1).
 * @param args.limit - Entries per page, max 100 (default 50).
 * @returns A LeaderboardPage with ranked entries and pagination metadata.
 */
export async function getLeaderboard(args: {
  gameKey: GameKey;
  entityType?: "human" | "ai" | "all";
  page?: number;
  limit?: number;
}): Promise<LeaderboardPage> {
  const entityType = args.entityType ?? "all";
  const page = Math.max(1, args.page ?? 1);
  const limit = Math.min(100, Math.max(1, args.limit ?? 50));

  const sortedEntries = await fetchSortedEntries(args.gameKey, entityType);
  const startIndex = (page - 1) * limit;

  return {
    gameKey: args.gameKey,
    entityType,
    page,
    limit,
    total: sortedEntries.length,
    entries: sortedEntries.slice(startIndex, startIndex + limit),
  };
}

/**
 * Drops the cached leaderboard for a game so the next request rebuilds it.
 * Should be called after any rated match updates ratings.
 *
 * @param gameKey - The game whose cache should be invalidated.
 */
export async function invalidateLeaderboardCache(gameKey: GameKey): Promise<void> {
  const redis = createRedisConnection();
  try {
    await redis.del(
      `leaderboard:${gameKey}:all`,
      `leaderboard:${gameKey}:human`,
      `leaderboard:${gameKey}:ai`,
    );
  } finally {
    await redis.quit();
  }
}
