import { withAuth, zGameKey, zMatchmakingJoinPayload } from "@gamenite/shared";
import { type GameServer, type RestAPI, type SocketAPI } from "../types.ts";
import { enforceAuth } from "../services/auth.service.ts";
import { createGame, joinGame, startGame } from "../services/game.service.ts";
import {
  getEntityRating,
  getQueueCounts,
  getQueueSnapshot,
  joinQueue,
  leaveQueue,
  resolveAiSeatForQueue,
  runMatchmakingTick,
  TICK_INTERVAL_MS,
  type QueueCounts,
  type QueueEntry,
} from "../services/matchmaker.service.ts";
import { logSocketError } from "./socket.controller.ts";

/**
 * Handle a request to join the matchmaking queue for a game. With a
 * deploymentId in the payload, the user's deployed model is queued in their
 * place (CoS 2.6): the deployment is validated (owned, active, right game,
 * AI-playable game) and the entry competes with the MODEL's rating.
 */
export const socketJoinQueue: SocketAPI = (socket) => async (body) => {
  try {
    const {
      auth,
      payload: { gameKey, rated, deploymentId },
    } = withAuth(zMatchmakingJoinPayload).parse(body);
    const user = await enforceAuth(auth);

    const aiSeat =
      deploymentId === undefined
        ? undefined
        : await resolveAiSeatForQueue(user, deploymentId, gameKey);
    const rating = await getEntityRating(
      aiSeat ? { type: "ai", id: aiSeat.modelId } : { type: "human", id: user.userId },
      gameKey,
    );

    joinQueue({
      userId: user.userId,
      username: user.username,
      gameKey,
      rating,
      rated,
      joinedAt: new Date(),
      socketId: socket.id,
      aiSeat,
    });
  } catch (err) {
    logSocketError(socket, err);
  }
};

/**
 * Handle a request to leave the matchmaking queue for a game.
 */
export const socketLeaveQueue: SocketAPI = (socket) => async (body) => {
  try {
    const { auth, payload: gameKey } = withAuth(zGameKey).parse(body);
    const user = await enforceAuth(auth);
    leaveQueue(user.userId, gameKey);
  } catch (err) {
    logSocketError(socket, err);
  }
};

/**
 * Creates a game for a matched pair (rated or unrated, per their shared
 * queue choice), the same way two players would by hand: create, join, then
 * start.
 */
async function startMatchedGame(io: GameServer, a: QueueEntry, b: QueueEntry): Promise<void> {
  const now = new Date();
  const game = await createGame(a, a.gameKey, now, a.rated);
  await joinGame(game.gameId, b);
  await startGame(game.gameId, a);

  io.to(a.socketId).emit("matchFound", { gameId: game.gameId, gameKey: a.gameKey });
  io.to(b.socketId).emit("matchFound", { gameId: game.gameId, gameKey: a.gameKey });
}

/**
 * Starts the matchmaking loop: every TICK_INTERVAL_MS, pairs up queued
 * players into rated games and times out anyone who's waited too long.
 */
export function startMatchmakerLoop(io: GameServer): NodeJS.Timeout {
  return setInterval(() => {
    const now = new Date();
    const { matched, timedOut } = runMatchmakingTick(now);

    for (const [a, b] of matched) {
      startMatchedGame(io, a, b).catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error("failed to start matched game:", err);
      });
    }

    for (const entry of timedOut) {
      io.to(entry.socketId).emit("matchmakingTimeout", { gameKey: entry.gameKey });
    }

    for (const { socketId, gameKey, window } of getQueueSnapshot(now)) {
      io.to(socketId).emit("matchmakingWindowUpdate", { gameKey, window });
    }
  }, TICK_INTERVAL_MS);
}

/**
 * GET /api/matchmaker/queue
 *
 * @returns how many players are currently queued for each game, broken down
 * by rated/unrated.
 */
export const getQueueStatus: RestAPI<QueueCounts> = (req, res) => {
  res.send(getQueueCounts());
  return Promise.resolve();
};
