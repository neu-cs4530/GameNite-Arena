import { useCallback } from "react";
import type { BroadcastInfo, GameInfo } from "@gamenite/shared";
import useAsync, { type AsyncResult } from "./useAsync.ts";
import { listLiveBroadcasts } from "../services/broadcastService.ts";
import { getGameById } from "../services/gameService.ts";
import { getPlayerRating } from "../services/ratingService.ts";
import type { LiveGameRow } from "../util/liveGames.ts";

/**
 * Fetches every live broadcast and enriches each into a LiveGameRow:
 * BroadcastInfo carries no game type or Elo, so we join each broadcast with
 * its GameInfo (type + players) and look up the human players' ratings for a
 * representative Elo. Enrichment is best-effort — a broadcast whose game can't
 * be loaded is dropped rather than rendered without a type; rating lookups
 * that fail just leave Elo null.
 */
async function enrich(broadcast: BroadcastInfo): Promise<LiveGameRow | null> {
  let game: GameInfo;
  try {
    game = await getGameById(broadcast.gameId);
  } catch {
    return null; // can't classify the game → omit from the dashboard
  }
  const humans = game.players.filter((p) => !p.isAi);
  const ratings = await Promise.all(humans.map((p) => getPlayerRating(game.type, p.username)));
  const known = ratings
    .filter((r): r is NonNullable<typeof r> => r !== null && r.gamesPlayed > 0)
    .map((r) => r.rating);
  return {
    broadcast,
    gameKey: game.type,
    players: game.players,
    elo: known.length > 0 ? Math.max(...known) : null,
    startedAt: broadcast.startedAt,
  };
}

export default function useLiveBroadcasts(): AsyncResult<LiveGameRow[]> {
  const producer = useCallback(async () => {
    const broadcasts = await listLiveBroadcasts();
    const rows = await Promise.all(broadcasts.map(enrich));
    return rows.filter((r): r is LiveGameRow => r !== null);
  }, []);
  return useAsync(producer, [], []);
}
