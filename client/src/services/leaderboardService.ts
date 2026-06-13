import type { ErrorMsg, GameKey } from "@gamenite/shared";
import { api } from "./api.ts";
import type { LeaderboardEntityFilter, LeaderboardPage, LeaderboardPeriod } from "../util/types.ts";

const LEADERBOARD_API_URL = "/api/leaderboard";

/**
 * Fetches one game's leaderboard.
 *
 * @param gameKey - Which game's board to load.
 * @param opts.type - Entity filter, applied server-side (default "all").
 * @param opts.period - "alltime" or "daily" (default "alltime").
 * @param opts.page - 1-indexed server page (default 1).
 * @param opts.limit - Entries per page, server max 100.
 * @param opts.fresh - Bypass the server's 5-minute cache read; used by the
 * post-match recap so it sees just-updated ratings.
 */
export const getLeaderboard = async (
  gameKey: GameKey,
  opts: {
    type?: LeaderboardEntityFilter;
    period?: LeaderboardPeriod;
    page?: number;
    limit?: number;
    fresh?: boolean;
  } = {},
): Promise<LeaderboardPage> => {
  const params = new URLSearchParams();
  if (opts.type) params.set("type", opts.type);
  if (opts.period) params.set("period", opts.period);
  if (opts.page) params.set("page", String(opts.page));
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.fresh) params.set("fresh", "1");

  const query = params.size > 0 ? `?${params.toString()}` : "";
  const res = await api.get<LeaderboardPage | ErrorMsg>(
    `${LEADERBOARD_API_URL}/${gameKey}${query}`,
  );
  if ("error" in res.data) throw new Error(res.data.error);
  return res.data;
};
