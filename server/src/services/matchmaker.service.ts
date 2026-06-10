import { type GameKey } from "@gamenite/shared";
import { getRating } from "./rating.service.ts";

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
  joinedAt: Date;
  socketId: string;
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

/** A player's current rating for a game, used as their queue rating. */
export async function getPlayerRating(userId: string, gameKey: GameKey): Promise<number> {
  const rating = await getRating(userId, gameKey);
  return rating.rating;
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
