import { type BroadcastInfo, type TaggedGameView } from "@gamenite/shared";
import { type GameServer, type UserWithId } from "../types.ts";
import { BroadcastRepo, GameRepo, UserRepo } from "../repository.ts";
import { createChat } from "./chat.service.ts";

/** Broadcaster-set delay bounds, in seconds (Story 3.7). */
export const MIN_DELAY_SEC = 0;
export const MAX_DELAY_SEC = 60;

/** The Socket.IO room carrying a broadcast's delayed feed to its spectators. */
export function broadcastRoom(broadcastId: string): string {
  return `broadcast:${broadcastId}`;
}

/**
 * Expand a stored broadcast into its info object (the record plus its id).
 *
 * @param broadcastId - Valid broadcast id
 * @returns the expanded broadcast info object
 */
async function populateBroadcastInfo(broadcastId: string): Promise<BroadcastInfo> {
  const broadcast = await BroadcastRepo.get(broadcastId);
  const broadcaster = await UserRepo.find(broadcast.broadcasterId);
  return { broadcastId, ...broadcast, broadcasterUsername: broadcaster?.username };
}

/**
 * Start a live broadcast of an in-progress game. The game must exist and be
 * active (started, not finished); the delay range is enforced by the
 * controller's schema. Creates a dedicated chat channel for the broadcast's
 * audience (Story 3.8) and returns the new broadcast.
 *
 * @param broadcaster - The user starting the broadcast
 * @param gameId - The game being broadcast
 * @param delaySec - Broadcaster-set delay, 0 to 60 seconds
 * @param startedAt - When the broadcast began
 * @returns the new broadcast's info object
 * @throws if the game doesn't exist or isn't in progress
 */
export async function startBroadcast(
  broadcaster: UserWithId,
  gameId: string,
  delaySec: number,
  startedAt: Date,
): Promise<BroadcastInfo> {
  const game = await GameRepo.find(gameId);
  if (!game) throw new Error(`Cannot broadcast unknown game ${gameId}`);
  // "In progress" = started (has state) and not yet finished. All games are
  // public in the current model, so there's no visibility check (Story 3.7).
  if (!game.state || game.done) throw new Error(`Game ${gameId} is not in progress`);

  const chat = await createChat(startedAt);
  const id = await BroadcastRepo.add({
    gameId,
    broadcasterId: broadcaster.userId,
    delaySec,
    status: "live",
    chatChannel: chat.chatId,
    startedAt: startedAt.toISOString(),
  });
  return populateBroadcastInfo(id);
}

/**
 * Retrieve a single broadcast from the database.
 *
 * @param possibleBroadcastId - Ostensible broadcast id
 * @returns the broadcast, or null if no broadcast with that id exists
 */
export async function getBroadcast(possibleBroadcastId: string): Promise<BroadcastInfo | null> {
  const broadcast = await BroadcastRepo.find(possibleBroadcastId);
  if (!broadcast) return null;
  const broadcaster = await UserRepo.find(broadcast.broadcasterId);
  return {
    broadcastId: possibleBroadcastId,
    ...broadcast,
    broadcasterUsername: broadcaster?.username,
  };
}

/**
 * List every currently-live broadcast, most recently started first. Backs the
 * spectator discovery view.
 */
export async function listLiveBroadcasts(): Promise<BroadcastInfo[]> {
  const keys = await BroadcastRepo.getAllKeys();
  const all = await Promise.all(keys.map(populateBroadcastInfo));
  return all
    .filter((broadcast) => broadcast.status === "live")
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/**
 * End a live broadcast. Only the broadcaster who started it may end it.
 *
 * @param requester - The user requesting the end
 * @param broadcastId - The broadcast to end
 * @param endedAt - When the broadcast ended
 * @returns the updated broadcast, or null if no broadcast with that id exists
 * @throws if the requester isn't the broadcaster
 */
export async function endBroadcast(
  requester: UserWithId,
  broadcastId: string,
  endedAt: Date,
): Promise<BroadcastInfo | null> {
  const broadcast = await BroadcastRepo.find(broadcastId);
  if (!broadcast) return null;
  if (broadcast.broadcasterId !== requester.userId) {
    throw new Error("Only the broadcaster can end this broadcast");
  }
  const updated = { ...broadcast, status: "ended" as const, endedAt: endedAt.toISOString() };
  await BroadcastRepo.set(broadcastId, updated);
  return { broadcastId, ...updated };
}

/**
 * Relay a game's watcher view to every live broadcast of that game, each after
 * its own broadcaster-set delay (Story 3.7). Server-side scheduled relay: a
 * timer holds the update so spectators see a genuinely delayed feed. Pending
 * timers live in-process and are dropped on restart, which is acceptable for a
 * live broadcast. Best-effort — never throws, so it can't disrupt live
 * gameplay updates.
 *
 * @param io - The Socket.IO server used to emit to broadcast rooms
 * @param gameId - The game whose view changed
 * @param view - The watcher-facing view to relay
 */
export async function relayGameViewToBroadcasts(
  io: GameServer,
  gameId: string,
  view: TaggedGameView,
): Promise<void> {
  try {
    const live = (await listLiveBroadcasts()).filter((broadcast) => broadcast.gameId === gameId);
    for (const broadcast of live) {
      const timer = setTimeout(() => {
        io.to(broadcastRoom(broadcast.broadcastId)).emit("broadcastStateUpdated", {
          broadcastId: broadcast.broadcastId,
          view,
        });
      }, broadcast.delaySec * 1000);
      // Don't let a pending relay keep the process alive on shutdown.
      timer.unref();
    }
  } catch {
    // Best-effort: a failed relay must not break live gameplay.
  }
}
