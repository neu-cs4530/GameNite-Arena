/**
 * /api/broadcast/... — REST handlers for the live broadcast lifecycle, plus the
 * socket handlers that join spectators to a broadcast's delayed feed. Pair with
 * the routes and socket registrations in server/src/app.ts; the service lives
 * in `../services/broadcast.service.ts`. The delayed relay itself is scheduled
 * from game.controller via `relayGameViewToBroadcasts`.
 */

import { withAuth, zUserAuth, type BroadcastInfo } from "@gamenite/shared";
import { z } from "zod";
import { checkAuth, enforceAuth } from "../services/auth.service.ts";
import {
  MAX_DELAY_SEC,
  MIN_DELAY_SEC,
  broadcastRoom,
  endBroadcast,
  getBroadcast,
  listLiveBroadcasts,
  startBroadcast,
} from "../services/broadcast.service.ts";
import { logSocketError } from "./socket.controller.ts";
import { type RestAPI, type SocketAPI } from "../types.ts";

/**
 * Body schema for starting a broadcast. The broadcaster, status, chat channel,
 * and timestamps are set server-side, so they aren't accepted here.
 */
const zStartBroadcast = z.object({
  gameId: z.string().min(1),
  delaySec: z.number().int().min(MIN_DELAY_SEC).max(MAX_DELAY_SEC),
});

/**
 * Handle POST requests to `/api/broadcast/create` that start a live broadcast
 * of an in-progress game.
 */
export const postCreate: RestAPI<BroadcastInfo> = async (req, res) => {
  const body = withAuth(zStartBroadcast).safeParse(req.body);
  if (!body.success) {
    res.status(400).send({ error: "Poorly-formed request" });
    return;
  }

  const user = await checkAuth(body.data.auth);
  if (!user) {
    res.status(403).send({ error: "Invalid credentials" });
    return;
  }

  try {
    const { gameId, delaySec } = body.data.payload;
    res.send(await startBroadcast(user, gameId, delaySec, new Date()));
  } catch {
    res.status(400).send({ error: "Game is not available to broadcast" });
  }
};

/**
 * Handle GET requests to `/api/broadcast/list`. Returns all currently-live
 * broadcasts, most recently started first.
 */
export const getList: RestAPI<BroadcastInfo[]> = async (req, res) => {
  res.send(await listLiveBroadcasts());
};

/**
 * Handle GET requests to `/api/broadcast/:id`. Returns either 404 or the
 * broadcast info object.
 */
export const getById: RestAPI<BroadcastInfo, { id: string }> = async (req, res) => {
  const broadcast = await getBroadcast(req.params.id);
  if (!broadcast) {
    res.status(404).send({ error: "Broadcast not found" });
    return;
  }

  res.send(broadcast);
};

/**
 * Handle POST requests to `/api/broadcast/:id/end`. Only the broadcaster who
 * started it may end it.
 */
export const postEnd: RestAPI<BroadcastInfo, { id: string }> = async (req, res) => {
  // Ending a broadcast needs only auth — the broadcast is identified by the URL
  // param — so we validate the auth envelope directly rather than via withAuth.
  const body = z.object({ auth: zUserAuth }).safeParse(req.body);
  if (!body.success) {
    res.status(400).send({ error: "Poorly-formed request" });
    return;
  }

  const user = await checkAuth(body.data.auth);
  if (!user) {
    res.status(403).send({ error: "Invalid credentials" });
    return;
  }

  try {
    const updated = await endBroadcast(user, req.params.id, new Date());
    if (!updated) {
      res.status(404).send({ error: "Broadcast not found" });
      return;
    }
    res.send(updated);
  } catch {
    res.status(403).send({ error: "Only the broadcaster can end this broadcast" });
  }
};

/**
 * Socket request: this connection is now watching a broadcast's delayed feed.
 * Joins the broadcast room so future relayed updates reach this spectator.
 */
export const socketBroadcastWatch: SocketAPI = (socket) => async (body) => {
  try {
    const { auth, payload: broadcastId } = withAuth(z.string()).parse(body);
    await enforceAuth(auth);
    const broadcast = await getBroadcast(broadcastId);
    if (!broadcast || broadcast.status !== "live") {
      throw new Error(`Cannot watch broadcast ${broadcastId}`);
    }
    await socket.join(broadcastRoom(broadcastId));
  } catch (err) {
    logSocketError(socket, err);
  }
};

/** Socket request: this connection stopped watching a broadcast. */
export const socketBroadcastLeave: SocketAPI = (socket) => async (body) => {
  try {
    const { auth, payload: broadcastId } = withAuth(z.string()).parse(body);
    await enforceAuth(auth);
    await socket.leave(broadcastRoom(broadcastId));
  } catch (err) {
    logSocketError(socket, err);
  }
};
