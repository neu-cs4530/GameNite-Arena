/**
 * /api/replay/... — REST handlers for the replay viewer + discovery, plus
 * the socket handlers for live watcher presence. Pair with the routes and
 * socket registrations in server/src/app.ts; the service lives in
 * `../services/replay.service.ts`.
 */

import { z } from "zod";
import { withAuth } from "@gamenite/shared";
import type {
  AnalysisResult,
  ReplayDetail,
  ReplayListPage,
  ReplayWatchCountResponse,
} from "@gamenite/shared";
import { checkAuth, enforceAuth } from "../services/auth.service.ts";
import { analyzeReplay } from "../services/analysis.service.ts";
import { DeploymentRepo } from "../repository.ts";
import { getReplay, listReplays, recordWatch } from "../services/replay.service.ts";
import { logSocketError } from "./socket.controller.ts";
import { type GameServer, type RestAPI, type SocketAPI } from "../types.ts";

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

/**
 * GET /api/replay/:matchId/download — the same replay payload as getById, but
 * served as a downloadable JSON file (Content-Disposition: attachment) so users
 * can save a match locally and re-import it into the viewer (COS 3.6).
 */
export const getDownload: RestAPI<ReplayDetail, { matchId: string }> = async (req, res) => {
  const replay = await getReplay(req.params.matchId);
  if (!replay) {
    res.status(404).send({ error: "Replay not found" });
    return;
  }
  // matchId is an untrusted route param, so never interpolate it raw into a
  // response header — strip it to filename-safe characters first.
  const safeId = req.params.matchId.replace(/[^a-zA-Z0-9_-]/g, "") || "replay";
  res.attachment(`replay-${safeId}.json`);
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

// Authed body for the analysis endpoint. The caller picks which of THEIR
// deployed models runs the engine; their userId is resolved server-side from
// credentials (the client never holds a raw userId), so ownership can't be
// spoofed by passing someone else's id.
const zAnalysisBody = withAuth(z.object({ deploymentId: z.string().optional() }));

/** POST /api/replay/:matchId/analysis — runs the move-quality engine over a finished match. */
export const postAnalysis: RestAPI<AnalysisResult, { matchId: string }> = async (req, res) => {
  const body = zAnalysisBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).send({ error: "Poorly-formed request" });
    return;
  }

  const user = await checkAuth(body.data.auth);
  if (!user) {
    res.status(403).send({ error: "Invalid credentials" });
    return;
  }

  const { deploymentId } = body.data.payload;
  if (deploymentId) {
    const deployment = await DeploymentRepo.find(deploymentId);
    if (!deployment) {
      res.status(404).send({ error: "Deployment not found" });
      return;
    }
    if (deployment.userId !== user.userId) {
      res.status(403).send({ error: "User does not own this deployment" });
      return;
    }
  }

  const result = await analyzeReplay(req.params.matchId, deploymentId);
  if (!result) {
    res.status(404).send({ error: "Replay not found" });
    return;
  }
  res.send(result);
};

/* ----------------------------------------------------------------------------
 * Live watcher presence
 *
 * Each open replay viewer joins a socket room; the room size IS the watcher
 * count — real presence, not an estimate. Every join/leave/disconnect
 * broadcasts the new count to the room.
 * ------------------------------------------------------------------------- */

/** The presence room for one replay. */
export function replayRoom(matchId: string): string {
  return `replay:${matchId}`;
}

const REPLAY_ROOM_PREFIX = "replay:";

function roomSize(io: GameServer, room: string): number {
  return io.sockets.adapter.rooms.get(room)?.size ?? 0;
}

function broadcastWatchers(io: GameServer, matchId: string, count: number): void {
  io.to(replayRoom(matchId)).emit("replayWatchers", { matchId, count });
}

/** Socket request: this connection is now watching the replay. */
export const socketReplayWatch: SocketAPI = (socket, io) => async (body) => {
  try {
    const { auth, payload: matchId } = withAuth(z.string()).parse(body);
    await enforceAuth(auth);
    await socket.join(replayRoom(matchId));
    broadcastWatchers(io, matchId, roomSize(io, replayRoom(matchId)));
  } catch (err) {
    logSocketError(socket, err);
  }
};

/** Socket request: this connection stopped watching the replay. */
export const socketReplayLeave: SocketAPI = (socket, io) => async (body) => {
  try {
    const { auth, payload: matchId } = withAuth(z.string()).parse(body);
    await enforceAuth(auth);
    await socket.leave(replayRoom(matchId));
    broadcastWatchers(io, matchId, roomSize(io, replayRoom(matchId)));
  } catch (err) {
    logSocketError(socket, err);
  }
};

/**
 * Disconnect cleanup: a closed tab never sends replayLeave, so on
 * `disconnecting` (rooms still populated) broadcast the post-departure count
 * to every replay room this socket was in. Registered in app.ts.
 */
export function handleReplayDisconnecting(socket: { rooms: Set<string> }, io: GameServer): void {
  for (const room of socket.rooms) {
    if (!room.startsWith(REPLAY_ROOM_PREFIX)) continue;
    const matchId = room.slice(REPLAY_ROOM_PREFIX.length);
    // This socket hasn't left yet, so the live count after disconnect is
    // the current size minus this socket.
    broadcastWatchers(io, matchId, Math.max(0, roomSize(io, room) - 1));
  }
}
