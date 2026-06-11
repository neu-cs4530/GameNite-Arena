import type { ErrorMsg, GameInfo, GameKey } from "@gamenite/shared";
import { api } from "./api.ts";

/** One game's queue population, split by mode. */
export interface QueueModeCounts {
  rated: number;
  unrated: number;
}

/**
 * GET /api/matchmaker/queue returns every playable game, but the mappers
 * treat entries as optional so a poll racing a freshly-added game key can
 * never blank the portal grid.
 */
export type QueueCounts = Partial<Record<GameKey, QueueModeCounts>>;

/** The wire shape of GET /api/rating/:gameKey/:username. */
export interface PlayerRating {
  gameKey: GameKey;
  username: string;
  rating: number;
  rd: number;
  gamesPlayed: number;
  provisional: boolean;
}

/** Live queue populations for every game — polled by the portal and queue pages. */
export const fetchQueueCounts = async (): Promise<QueueCounts> => {
  const res = await api.get<QueueCounts | ErrorMsg>("/api/matchmaker/queue");
  if ("error" in res.data) throw new Error(res.data.error);
  return res.data;
};

/** One player's rating in one game, with honest defaults for new players. */
export const fetchRating = async (gameKey: GameKey, username: string): Promise<PlayerRating> => {
  const res = await api.get<PlayerRating | ErrorMsg>(`/api/rating/${gameKey}/${username}`);
  if ("error" in res.data) throw new Error(res.data.error);
  return res.data;
};

/** The live-count line on a portal game tile, total over missing data. */
export function queueTileLabel(counts: QueueModeCounts | undefined): string {
  return `${counts?.rated ?? 0} in ranked queue · ${counts?.unrated ?? 0} casual`;
}

/** How many players are in ONE pool (same game, same mode) right now. */
export function poolSize(counts: QueueCounts, gameKey: GameKey, rated: boolean): number {
  const game = counts[gameKey];
  if (!game) return 0;
  return rated ? game.rated : game.unrated;
}

/**
 * The user's unfinished games — the reconnect path now that lobbies are
 * gone: a match made by the queue lives at /game/:id, and this is how a
 * player finds their way back after a refresh.
 */
export function inProgressGamesFor(games: GameInfo[], username: string): GameInfo[] {
  return games.filter(
    (game) => game.status !== "done" && game.players.some((p) => p.username === username),
  );
}
