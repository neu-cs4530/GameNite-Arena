import { zGameKey } from "@gamenite/shared";
import { z } from "zod";
import { getLeaderboard, type LeaderboardPage } from "../services/leaderboard.service.ts";
import { type RestAPI } from "../types.ts";

const zLeaderboardQuery = z.object({
  type: z.enum(["human", "ai", "all"]).default("all"),
  period: z.enum(["alltime", "daily"]).default("alltime"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  fresh: z.enum(["0", "1"]).default("0"),
});

/**
 * GET /api/leaderboard/:gameKey
 *
 * Query params:
 *   type   - "human" | "ai" | "all" (default "all")
 *   period - "alltime" | "daily" (default "alltime")
 *   page   - 1-indexed page number (default 1)
 *   limit  - entries per page, max 100 (default 50)
 *   fresh  - "1" bypasses the 5-minute cache read so post-match consumers see
 *            just-updated ratings (the rebuild re-warms the cache); default "0"
 *
 * @returns A paginated LeaderboardPage.
 */
export const getByGame: RestAPI<LeaderboardPage, { gameKey: string }> = async (req, res) => {
  const gameKey = zGameKey.safeParse(req.params.gameKey);
  if (!gameKey.success) {
    res.status(400).send({ error: "Unknown game" });
    return;
  }

  const query = zLeaderboardQuery.safeParse(req.query);
  if (!query.success) {
    res.status(400).send({ error: "Invalid query parameters" });
    return;
  }

  const result = await getLeaderboard({
    gameKey: gameKey.data,
    entityType: query.data.type,
    period: query.data.period,
    page: query.data.page,
    limit: query.data.limit,
    fresh: query.data.fresh === "1",
  });

  res.send(result);
};
