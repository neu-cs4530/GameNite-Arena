import { AI_PLAYABLE_GAME_KEYS, type GameKey } from "@gamenite/shared";
import { gameServices } from "./game.service.ts";
import { getRatingForEntity, type RatingEntity } from "./rating.service.ts";
import { type AIParticipant } from "../models.ts";
import { DeploymentRepo } from "../repository.ts";
import { type UserWithId } from "../types.ts";

// how often the matchmaker loop runs
export const TICK_INTERVAL_MS = 2000;

// rating window a player starts with, and how much it grows per tick
const INITIAL_WINDOW = 100;
const WINDOW_EXPANSION_PER_TICK = 50;

// give up on a queued player after waiting this long
export const MAX_WAIT_MS = 60000;

export interface QueueEntry {
  userId: string;
  username: string;
  gameKey: GameKey;
  rating: number;
  rated: boolean;
  joinedAt: Date;
  socketId: string;
  /**
   * When set, the user queued their deployed model to play in their place
   * (CoS 2.6). The entry's `rating` is then the MODEL's rating, and the
   * match seats the deployment instead of the user. Models and humans share
   * pools by design — a model entry matches anyone in the same gameKey+rated
   * pool.
   */
  aiSeat?: AIParticipant;
}

let queue: QueueEntry[] = [];

/** How big a rating gap this player will currently accept. */
function currentWindow(joinedAt: Date, now: Date): number {
  const ticksWaited = Math.floor((now.getTime() - joinedAt.getTime()) / TICK_INTERVAL_MS);
  return INITIAL_WINDOW + WINDOW_EXPANSION_PER_TICK * ticksWaited;
}

/** Finds the closest-rated pair whose rating gap fits both players' windows. */
function findMatch(now: Date): [QueueEntry, QueueEntry] | null {
  let best: [QueueEntry, QueueEntry] | null = null;
  let bestDiff = Infinity;

  for (let i = 0; i < queue.length; i++) {
    for (let j = i + 1; j < queue.length; j++) {
      const a = queue[i];
      const b = queue[j];
      if (a.gameKey !== b.gameKey) continue;
      if (a.rated !== b.rated) continue;

      const diff = Math.abs(a.rating - b.rating);
      const window = Math.min(currentWindow(a.joinedAt, now), currentWindow(b.joinedAt, now));

      if (diff <= window && diff < bestDiff) {
        best = [a, b];
        bestDiff = diff;
      }
    }
  }

  return best;
}

/** Adds a player to the queue, unless they're already queued for this game. */
export function joinQueue(entry: QueueEntry): void {
  const alreadyQueued = queue.some((e) => e.userId === entry.userId && e.gameKey === entry.gameKey);
  if (!alreadyQueued) queue.push(entry);
}

/** Removes a player from the queue for a game. */
export function leaveQueue(userId: string, gameKey: GameKey): void {
  queue = queue.filter((e) => !(e.userId === userId && e.gameKey === gameKey));
}

/** An entity's (player's or model's) current rating, used as its queue rating. */
export async function getEntityRating(entity: RatingEntity, gameKey: GameKey): Promise<number> {
  const rating = await getRatingForEntity(entity, gameKey);
  return rating.rating;
}

/** A player's current rating for a game, used as their queue rating. */
export function getPlayerRating(userId: string, gameKey: GameKey): Promise<number> {
  return getEntityRating({ type: "human", id: userId }, gameKey);
}

/**
 * Validates a queue-with-deployment request (CoS 2.6) and resolves the AI
 * seat the matchmaker should place. A deployment may only be queued by its
 * owner, while active, for its own game, and only for games models can play.
 *
 * @param user - The authenticated user asking to queue their model.
 * @param deploymentId - The deployment from the join payload.
 * @param gameKey - The game pool being joined.
 * @returns the AI participant to seat at match time.
 * @throws on any validation violation (caller reports it like any bad join).
 */
export async function resolveAiSeatForQueue(
  user: UserWithId,
  deploymentId: string,
  gameKey: GameKey,
): Promise<AIParticipant> {
  if (!AI_PLAYABLE_GAME_KEYS.includes(gameKey)) {
    throw new Error(
      `user ${user.username} queued a model for ${gameKey}, but models cannot play ${gameKey}`,
    );
  }
  const deployment = await DeploymentRepo.find(deploymentId);
  if (!deployment) {
    throw new Error(`user ${user.username} queued a deployment that does not exist`);
  }
  if (deployment.userId !== user.userId) {
    throw new Error(`user ${user.username} queued a deployment they do not own`);
  }
  if (deployment.status !== "active") {
    throw new Error(`user ${user.username} queued a deployment that is not active`);
  }
  if (deployment.gameKey !== gameKey) {
    throw new Error(
      `user ${user.username} queued a ${deployment.gameKey} deployment for ${gameKey}`,
    );
  }
  return { deploymentId, modelId: deployment.modelId, displayName: deployment.displayName };
}

/** Each queued player's game/rated mode and current rating window, for live updates. */
export function getQueueSnapshot(
  now: Date,
): { socketId: string; gameKey: GameKey; window: number }[] {
  return queue.map((entry) => ({
    socketId: entry.socketId,
    gameKey: entry.gameKey,
    window: currentWindow(entry.joinedAt, now),
  }));
}

export type QueueCounts = Record<GameKey, { rated: number; unrated: number }>;

/** How many players are queued for each game, broken down by rated/unrated. */
export function getQueueCounts(): QueueCounts {
  const counts = Object.fromEntries(
    (Object.keys(gameServices) as GameKey[]).map((gameKey) => [gameKey, { rated: 0, unrated: 0 }]),
  ) as QueueCounts;

  for (const entry of queue) {
    counts[entry.gameKey][entry.rated ? "rated" : "unrated"]++;
  }

  return counts;
}

/**
 * Runs one matchmaking tick: pairs up players until no more matches are
 * found, then removes anyone who's waited too long.
 */
export function runMatchmakingTick(now: Date): {
  matched: [QueueEntry, QueueEntry][];
  timedOut: QueueEntry[];
} {
  const matched: [QueueEntry, QueueEntry][] = [];

  let pair = findMatch(now);
  while (pair) {
    const [a, b] = pair;
    matched.push(pair);
    queue = queue.filter((e) => e !== a && e !== b);
    pair = findMatch(now);
  }

  const timedOut = queue.filter((e) => now.getTime() - e.joinedAt.getTime() >= MAX_WAIT_MS);
  queue = queue.filter((e) => !timedOut.includes(e));

  return { matched, timedOut };
}
