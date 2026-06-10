/**
 * /api/replay/... — REST handlers for the replay viewer + discovery.
 * Pair with `routes` from server/src/app.ts; the service lives in
 * `../services/replay.service.ts`.
 */

import { z } from "zod";
import type { ReplayDetail, ReplayListPage, ReplayWatchCountResponse } from "@gamenite/shared";
import { getReplay, listReplays, recordWatch } from "../services/replay.service.ts";
import { type RestAPI } from "../types.ts";

const zGameKey = z.enum(["tictactoe", "connect4", "checkers", "nim", "guess"]);
const zSort = z.enum([
  "newest",
  "oldest",
  "most-viewed",
  "fewest-viewed",
  "longest",
  "shortest",
  "highest-elo",
  "lowest-elo",
]);
const zParticipantType = z.enum(["all", "humans", "ais", "mixed"]);
const zDate = z.enum(["all", "today", "week", "month", "year", "custom"]);
const zResult = z.enum(["wins", "losses", "draws", "abandoned", "forfeit"]);

// Repeating query params arrive as `games=a&games=b&games=c`. Express collapses
// them to either a string (single value) or string[] (multiple) — coerce both
// shapes into a list for downstream validation.
function normalizeListParam(v: unknown): unknown {
  if (v === undefined) return undefined;
  if (Array.isArray(v)) return v as string[];
  if (typeof v === "string" && v.length > 0) return v.split(",");
  return v;
}

const csvOrArray = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess(normalizeListParam, z.array(item).optional());

const zListQuery = z.object({
  sort: zSort.optional(),
  games: csvOrArray(zGameKey),
  participantType: zParticipantType.optional(),
  results: csvOrArray(zResult),
  minElo: z.coerce.number().int().optional(),
  maxElo: z.coerce.number().int().optional(),
  date: zDate.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  minMoves: z.coerce.number().int().optional(),
  maxMoves: z.coerce.number().int().optional(),
  participantSearch: z.string().optional(),
  ratedOnly: z.coerce.boolean().optional(),
  preset: z.literal("upsets").optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  forUser: z.string().optional(),
});

/** GET /api/replay/list */
export const getList: RestAPI<ReplayListPage> = async (req, res) => {
  const parsed = zListQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).send({ error: "Invalid query parameters" });
    return;
  }
  const page = await listReplays(parsed.data);
  res.send(page);
};

/** GET /api/replay/:matchId */
export const getById: RestAPI<ReplayDetail, { matchId: string }> = async (req, res) => {
  const replay = await getReplay(req.params.matchId);
  if (!replay) {
    res.status(404).send({ error: "Replay not found" });
    return;
  }
  res.send(replay);
};

/** POST /api/replay/:matchId/view — bumps the watch counter and returns it. */
export const postView: RestAPI<ReplayWatchCountResponse, { matchId: string }> = async (
  req,
  res,
) => {
  const updated = await recordWatch(req.params.matchId);
  if (!updated) {
    res.status(404).send({ error: "Replay not found" });
    return;
  }
  res.send(updated);
};
