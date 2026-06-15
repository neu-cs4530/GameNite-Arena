/**
 * Profile service — builds the aggregate {@link ProfileSummary} served by
 * `GET /api/profile/:username` (docs/profile-puzzles-rework.md, "New read
 * endpoints"). One build covers every pill scope on the profile page:
 * General, each game, and Puzzles. Everything is computed from the REAL
 * repos — the match archive, rating records, watch counts, the model repo,
 * and the puzzle attempt log — never fabricated.
 *
 * COST NOTE (future work): every call performs one full scan of MatchRepo
 * plus full scans of ModelRepo, PuzzleAttemptRepo and WatchCountRepo keys
 * (getAllKeys + getMany — the same idiom as leaderboard.service.ts). There
 * is deliberately NO caching yet: profile reads are rare relative to match
 * traffic, and the archive is small. When the archive grows, add a
 * short-TTL Redis cache keyed by username (mirroring the leaderboard's
 * 5-minute cache) or push the scans down into repo-level queries.
 */
import {
  zGameKey,
  type GameKey,
  type HeatmapGrid,
  type ProfileBestAi,
  type ProfileGameSummary,
  type ProfileGeneralSummary,
  type ProfilePuzzleAttemptView,
  type ProfilePuzzleGameStats,
  type ProfilePuzzleStats,
  type ProfileRatingStats,
  type ProfileRecordStats,
  type ProfileSummary,
  type ReplayGameKey,
  type ReplaySummary,
} from "@gamenite/shared";
import {
  ratingKey,
  type GlickoRating,
  type MatchRecord,
  type PuzzleAttemptRecord,
  type RatingRecord,
  type UserRecord,
} from "../models.ts";
import {
  DeploymentRepo,
  MatchRepo,
  ModelRepo,
  PuzzleAttemptRepo,
  RatingRepo,
  UserRepo,
  WatchCountRepo,
} from "../repository.ts";
import { getUserByUsername } from "./auth.service.ts";
import { DEFAULT_RATING, isProvisional } from "./glicko2.service.ts";
import { effectiveStreak } from "./puzzleStreak.util.ts";
import { populateSafeUserInfo } from "./user.service.ts";

/** Canonical pill order — mirrors the ReplayGameKey union in shared/src/replay.types.ts. */
const REPLAY_GAME_ORDER: readonly ReplayGameKey[] = [
  "tictactoe",
  "connect4",
  "checkers",
  "nim",
  "guess",
];

/**
 * REPLAY_GAME_ORDER narrowed to the games this server actually runs. Matches
 * and ratings are typed by GameKey, so non-server ReplayGameKeys can never
 * hold data and never appear in perGame.
 */
const SERVER_GAME_ORDER: readonly GameKey[] = REPLAY_GAME_ORDER.flatMap((key) => {
  const parsed = zGameKey.safeParse(key);
  return parsed.success ? [parsed.data] : [];
});

/** A MatchRecord paired with its repo key (the matchId clients link to). */
interface ArchivedMatch {
  matchId: string;
  record: MatchRecord;
}

/** Number of attempts surfaced in `puzzles.recentAttempts`. */
const RECENT_ATTEMPT_LIMIT = 20;

/**
 * Classifies an entity's W/L/D over a set of matches. A forfeited or
 * abandoned match WITH a recorded winner is a decided result: a win for the
 * winner and a loss for everyone else. Undecided matches (no winner, not a
 * draw) count toward the total only.
 */
function classifyRecord(matches: ArchivedMatch[], entityId: string): ProfileRecordStats {
  return classifyRecordAgainst(matches, new Set([entityId]));
}

/**
 * Like `classifyRecord`, but a win is any match whose `winnerId` is one of
 * `winningIds`. Needed when the entity's seat id in `result.winnerId` differs
 * from its participant id (AI seats: deployment id vs model id).
 */
function classifyRecordAgainst(
  matches: ArchivedMatch[],
  winningIds: Set<string>,
): ProfileRecordStats {
  const stats: ProfileRecordStats = { totalMatches: matches.length, wins: 0, losses: 0, draws: 0 };
  for (const { record } of matches) {
    const { winnerId, outcome } = record.result;
    if (outcome === "draw") stats.draws += 1;
    else if (winnerId !== undefined && winningIds.has(winnerId)) stats.wins += 1;
    else if (winnerId !== undefined) stats.losses += 1;
  }
  return stats;
}

/** Buckets matches into a 7×24 grid: row = UTC weekday (Sun..Sat), col = UTC hour. */
function bucketHeatmap(matches: ArchivedMatch[]): HeatmapGrid {
  const grid: HeatmapGrid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const { record } of matches) {
    const completed = new Date(record.completedAt);
    grid[completed.getUTCDay()][completed.getUTCHours()] += 1;
  }
  return grid;
}

/**
 * Reads watch counts for the given matchIds. Most matches have never been
 * watched and hold no record, so the ids are intersected with the repo's
 * keys first (getMany throws on missing keys); absent counts read as 0.
 */
async function readWatchCounts(matchIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (matchIds.length === 0) return counts;
  const stored = new Set(await WatchCountRepo.getAllKeys());
  const present = matchIds.filter((id) => stored.has(id));
  if (present.length === 0) return counts;
  const values = await WatchCountRepo.getMany(present);
  present.forEach((id, i) => counts.set(id, values[i]));
  return counts;
}

/** Projects an archived match into the wire ReplaySummary (same projection as replay.service). */
async function matchToReplaySummary(
  { matchId, record }: ArchivedMatch,
  watchCount: number,
): Promise<ReplaySummary> {
  const participants = await Promise.all(
    record.participants.map(async (p) => ({
      id: p.id,
      type: p.type,
      displayName: p.displayName,
      username: p.type === "human" ? (await UserRepo.find(p.id))?.username : undefined,
    })),
  );
  return {
    matchId,
    gameKey: record.gameKey,
    rated: record.rated,
    participants,
    result: record.result,
    moveCount: record.moves.length,
    watchCount,
    completedAt: record.completedAt,
  };
}

/** The match with the highest watch count; ties go to the newer match. */
async function pickMostViewed(
  matches: ArchivedMatch[],
  counts: Map<string, number>,
): Promise<ReplaySummary | null> {
  let best: ArchivedMatch | null = null;
  let bestCount = -1;
  for (const candidate of matches) {
    const count = counts.get(candidate.matchId) ?? 0;
    const wins =
      count > bestCount ||
      (count === bestCount &&
        best !== null &&
        candidate.record.completedAt > best.record.completedAt);
    if (wins) {
      best = candidate;
      bestCount = count;
    }
  }
  return best === null ? null : matchToReplaySummary(best, bestCount);
}

/**
 * Reconstructs the user's post-match rating walk for one game by replaying
 * their RATED matches' `ratingChanges` in completedAt order from the 1500
 * baseline. Matches without a delta for this user contribute no point.
 */
function walkPostMatchRatings(gameMatches: ArchivedMatch[], userId: string): number[] {
  const chronological = [...gameMatches]
    .filter(({ record }) => record.rated)
    .sort((a, b) => a.record.completedAt.localeCompare(b.record.completedAt));
  let rating = DEFAULT_RATING;
  const walk: number[] = [];
  for (const { record } of chronological) {
    const change = record.result.ratingChanges?.find((c) => c.entityId === userId);
    if (!change) continue;
    rating += change.delta;
    walk.push(rating);
  }
  return walk;
}

/**
 * Rating stats for one game: `current` straight from the RatingRecord (null
 * when the user is unrated), peak/average from the rating walk. With no
 * record the player is maximally uncertain, so `provisional` is true.
 */
async function buildRatingStats(
  gameKey: GameKey,
  gameMatches: ArchivedMatch[],
  userId: string,
): Promise<ProfileRatingStats> {
  const record = await RatingRepo.find(
    ratingKey({ entityType: "human", entityId: userId, gameKey }),
  );
  const current = record?.rating ?? null;
  const walk = walkPostMatchRatings(gameMatches, userId);
  const peakCandidates = current === null ? walk : [...walk, current];
  return {
    current,
    peak: peakCandidates.length === 0 ? null : Math.max(...peakCandidates),
    average:
      walk.length === 0 ? null : Math.round(walk.reduce((sum, r) => sum + r, 0) / walk.length),
    gamesPlayed: record?.gamesPlayed ?? 0,
    provisional: record
      ? isProvisional({ rating: record.rating, rd: record.rd, volatility: record.vol })
      : true,
  };
}

/**
 * The user's proudest AI: scans their models, keeps the ones with an arena
 * rating, and picks the highest-rated. W/L comes from the match archive
 * (matches where the model itself was a participant). Honest null when the
 * user has no rated AI — the client renders an empty state.
 */
async function buildBestAi(
  userId: string,
  archive: ArchivedMatch[],
): Promise<ProfileBestAi | null> {
  const modelKeys = await ModelRepo.getAllKeys();
  const models = modelKeys.length === 0 ? [] : await ModelRepo.getMany(modelKeys);

  let best: { modelId: string; displayName: string; rating: RatingRecord } | null = null;
  for (let i = 0; i < models.length; i += 1) {
    if (models[i].userId !== userId) continue;
    const rating = await RatingRepo.find(
      ratingKey({ entityType: "ai", entityId: modelKeys[i], gameKey: models[i].gameKey }),
    );
    if (!rating) continue;
    if (best === null || rating.rating > best.rating.rating) {
      best = { modelId: modelKeys[i], displayName: models[i].displayName, rating };
    }
  }
  if (best === null) return null;

  const { modelId, displayName, rating } = best;
  const aiMatches = archive.filter(({ record }) =>
    record.participants.some((p) => p.type === "ai" && p.id === modelId),
  );
  // A match's archived participant id for an AI seat is the MODEL id, but
  // `result.winnerId` is the SEAT id — i.e. the deployment id (game.players
  // holds deployment ids for AI seats). So winning is decided against the
  // model's deployment ids, not its model id. A model can have several
  // deployments over its lifetime; any of them winning counts.
  const deploymentKeys = await DeploymentRepo.getAllKeys();
  const deployments =
    deploymentKeys.length === 0 ? [] : await DeploymentRepo.getMany(deploymentKeys);
  const winningIds = new Set<string>([modelId]); // tolerate either id shape
  deploymentKeys.forEach((key, i) => {
    if (deployments[i].modelId === modelId) winningIds.add(key);
  });
  const { wins, losses } = classifyRecordAgainst(aiMatches, winningIds);
  return {
    modelId,
    displayName,
    gameKey: rating.gameKey,
    rating: rating.rating,
    gamesPlayed: rating.gamesPlayed,
    wins,
    losses,
  };
}

/** Splits a puzzleId of the form `<gameKey>:<YYYY-MM-DD>`; null when malformed. */
function parsePuzzleId(puzzleId: string): { gameKey: GameKey; date: string } | null {
  const sep = puzzleId.indexOf(":");
  if (sep < 0) return null;
  const parsed = zGameKey.safeParse(puzzleId.slice(0, sep));
  if (!parsed.success) return null;
  return { gameKey: parsed.data, date: puzzleId.slice(sep + 1) };
}

/** An attempt's rated flag; legacy records lack it, so fall back to "the rating moved". */
function attemptWasRated(attempt: PuzzleAttemptRecord): boolean {
  return attempt.rated ?? attempt.eloDelta !== 0;
}

/**
 * Puzzle stats: per-game ratings live on the UserRecord, attempt aggregates
 * come from one PuzzleAttemptRepo scan, and the streak is served EFFECTIVE
 * (zeroed when the chain broke) — never the raw stored value.
 */
async function buildPuzzleStats(
  userId: string,
  userRecord: UserRecord,
): Promise<ProfilePuzzleStats> {
  // puzzleRatings / puzzleStreak may be absent on user records created before
  // Story 1.8 (legacy data that predates the backfill migration). The profile
  // is a read-only view and must never 500 on such a record — same defensive
  // guard follow.service and puzzleLeaderboard.service already apply.
  const puzzleRatings = userRecord.puzzleRatings ?? {};
  const puzzleStreak = userRecord.puzzleStreak ?? { current: 0, best: 0 };

  const attemptKeys = await PuzzleAttemptRepo.getAllKeys();
  const allAttempts = attemptKeys.length === 0 ? [] : await PuzzleAttemptRepo.getMany(attemptKeys);

  const mine: { attempt: PuzzleAttemptRecord; gameKey: GameKey; date: string }[] = [];
  for (const attempt of allAttempts) {
    if (attempt.attemptedBy.type !== "human" || attempt.attemptedBy.id !== userId) continue;
    const parsed = parsePuzzleId(attempt.puzzleId);
    if (!parsed) continue;
    mine.push({ attempt, ...parsed });
  }

  const perGame: ProfilePuzzleGameStats[] = [];
  for (const gameKey of SERVER_GAME_ORDER) {
    const glicko: GlickoRating | undefined = puzzleRatings[gameKey];
    const attempts = mine.filter((a) => a.gameKey === gameKey);
    if (!glicko && attempts.length === 0) continue;
    const solves = attempts.filter((a) => a.attempt.success).length;
    perGame.push({
      gameKey,
      rating: glicko ? Math.round(glicko.rating) : null,
      provisional: glicko
        ? isProvisional({ rating: glicko.rating, rd: glicko.rd, volatility: glicko.vol })
        : true,
      attempts: attempts.length,
      solves,
      solveRate: attempts.length === 0 ? 0 : solves / attempts.length,
      avgTimeMs:
        attempts.length === 0
          ? null
          : Math.round(attempts.reduce((sum, a) => sum + a.attempt.timeMs, 0) / attempts.length),
    });
  }

  const ratings = SERVER_GAME_ORDER.flatMap((gameKey) => {
    const glicko = puzzleRatings[gameKey];
    return glicko ? [glicko.rating] : [];
  });

  const recentAttempts: ProfilePuzzleAttemptView[] = [...mine]
    .sort((a, b) => b.attempt.createdAt.localeCompare(a.attempt.createdAt))
    .slice(0, RECENT_ATTEMPT_LIMIT)
    .map(({ attempt, gameKey, date }) => ({
      date,
      gameKey,
      success: attempt.success,
      rated: attemptWasRated(attempt),
      timeMs: attempt.timeMs,
      eloDelta: attempt.eloDelta,
      createdAt: attempt.createdAt,
    }));

  return {
    overallRating:
      ratings.length === 0
        ? null
        : Math.round(ratings.reduce((sum, r) => sum + r, 0) / ratings.length),
    perGame,
    streak: effectiveStreak(puzzleStreak),
    recentAttempts,
  };
}

/**
 * Builds the full ProfileSummary for one user.
 *
 * @param username - The profile owner's username.
 * @returns The aggregate summary, or null when the username is unknown.
 */
export async function buildProfileSummary(username: string): Promise<ProfileSummary | null> {
  const found = await getUserByUsername(username);
  if (!found) return null;
  const userId = found.userId;
  const [user, userRecord] = await Promise.all([
    populateSafeUserInfo(userId),
    UserRepo.get(userId),
  ]);

  // One scan of the archive feeds the records, heatmaps, rating walks,
  // most-viewed heroes AND the bestAi W/L (see the cost note up top).
  const matchKeys = await MatchRepo.getAllKeys();
  const matchRecords = matchKeys.length === 0 ? [] : await MatchRepo.getMany(matchKeys);
  const archive: ArchivedMatch[] = matchKeys.map((matchId, i) => ({
    matchId,
    record: matchRecords[i],
  }));

  const userMatches = archive.filter(({ record }) =>
    record.participants.some((p) => p.type === "human" && p.id === userId),
  );
  const watchCounts = await readWatchCounts(userMatches.map((m) => m.matchId));

  // perGame: one entry per canonical game the user has matches OR a rating in
  const perGame: ProfileGameSummary[] = [];
  for (const gameKey of SERVER_GAME_ORDER) {
    const gameMatches = userMatches.filter(({ record }) => record.gameKey === gameKey);
    const rating = await buildRatingStats(gameKey, gameMatches, userId);
    if (gameMatches.length === 0 && rating.current === null) continue;
    perGame.push({
      gameKey,
      rating,
      record: classifyRecord(gameMatches, userId),
      heatmap: bucketHeatmap(gameMatches),
      mostViewed: await pickMostViewed(gameMatches, watchCounts),
    });
  }

  const peaks = perGame.flatMap((g) => (g.rating.peak === null ? [] : [g.rating.peak]));
  const currents = perGame.flatMap((g) => (g.rating.current === null ? [] : [g.rating.current]));
  const general: ProfileGeneralSummary = {
    record: classifyRecord(userMatches, userId),
    peakElo: peaks.length === 0 ? null : Math.max(...peaks),
    averageElo:
      currents.length === 0
        ? null
        : Math.round(currents.reduce((sum, r) => sum + r, 0) / currents.length),
    heatmap: bucketHeatmap(userMatches),
    bestAi: await buildBestAi(userId, archive),
    mostViewed: await pickMostViewed(userMatches, watchCounts),
  };

  return {
    user,
    general,
    perGame,
    puzzles: await buildPuzzleStats(userId, userRecord),
  };
}
