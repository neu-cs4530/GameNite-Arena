/**
 * Player rating reads (real only). Backs Elo enrichment for the live-games
 * dashboard: BroadcastInfo carries no rating, so each live game's players are
 * looked up individually.
 *
 * Server endpoint (rating.controller.ts):
 *   GET /api/rating/:gameKey/:username -> PlayerRatingView
 */

import type { GameKey } from "@gamenite/shared";
import { api } from "./api.ts";

/** One player's rating in one game (mirrors the server's PlayerRatingView). */
export interface PlayerRatingView {
  gameKey: GameKey;
  username: string;
  rating: number;
  rd: number;
  gamesPlayed: number;
  provisional: boolean;
}

/**
 * Fetch a player's rating in a game. Returns null on any failure (unknown
 * user, network) — Elo enrichment is best-effort and must never break the
 * dashboard.
 */
export async function getPlayerRating(
  gameKey: GameKey,
  username: string,
): Promise<PlayerRatingView | null> {
  try {
    const res = await api.get<PlayerRatingView>(
      `/api/rating/${encodeURIComponent(gameKey)}/${encodeURIComponent(username)}`,
    );
    return res.data;
  } catch {
    return null;
  }
}
