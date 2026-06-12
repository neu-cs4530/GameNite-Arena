import { type GameInfo, withAuth, zGameKey, zGameMakeMovePayload } from "@gamenite/shared";
import { type RestAPI, type GameViewUpdates, type SocketAPI, type GameServer } from "../types.ts";
import {
  createGame,
  gameServices,
  getGameById,
  getGames,
  joinGame,
  startGame,
  updateGame,
  viewGame,
  maybeFireAiMove,
} from "../services/game.service.ts";
import { z } from "zod";
import { logSocketError } from "./socket.controller.ts";
import { checkAuth, enforceAuth } from "../services/auth.service.ts";
import { relayGameViewToBroadcasts } from "../services/broadcast.service.ts";

/**
 * Handle POST requests to `/api/game/create` by creating a game. The game
 * starts with one player, the user who made the POST request.
 */
export const postCreate: RestAPI<GameInfo> = async (req, res) => {
  const body = withAuth(zGameKey).safeParse(req.body);
  if (body.error) {
    res.status(400).send({ error: "Poorly-formed request" });
    return;
  }

  const user = await checkAuth(body.data.auth);
  if (!user) {
    res.status(403).send({ error: "Invalid credentials" });
    return;
  }

  const game = await createGame(user, body.data.payload, new Date());
  res.send(game);
};

/**
 * Handle GET requests to `/api/game/:id`. Returns either 404 or a game info
 * object.
 */
export const getById: RestAPI<GameInfo, { id: string }> = async (req, res) => {
  const game = await getGameById(req.params.id);
  if (!game) {
    res.status(404).send({ error: "Game not found" });
    return;
  }

  res.send(game);
};

/**
 * Handle GET requests to `/api/game/list` by returning information about all
 * games, sorted in reverse chronological order by creation.
 */
export const getList: RestAPI<GameInfo[]> = async (req, res) => {
  res.send(await getGames());
};

/**
 * Each active game player gets a dedicated room that sends messages
 * to just their socket connections. This function derives that room name from
 * the game id and the username.
 *
 * @param gameId - the game id, also the 'base' room name
 * @param userId - user id (not username!)
 * @returns a room name unique to that game id and user
 */
function userRoom(gameId: string, user: string) {
  return `${gameId}-${user}`;
}

/**
 * Handle the socket request sent by a user when they load to a game page. The
 * server's job is to respond with full information about the game's current
 * players and the appropriate view of the game's state. The server also needs
 * to register the user for future updates about the game's state.
 */
export const socketWatch: SocketAPI = (socket) => async (body) => {
  try {
    const { auth, payload: gameId } = withAuth(z.string()).parse(body);
    const user = await enforceAuth(auth);
    const { isPlayer, view, players } = await viewGame(gameId, user);
    const roomsToJoin = isPlayer ? [gameId, userRoom(gameId, user.userId)] : [gameId];
    await socket.join(roomsToJoin);
    socket.emit("gameWatched", { gameId, view, players });
  } catch (err) {
    logSocketError(socket, err);
  }
};

/**
 * Broadcast view updates to appropriate users
 */
/**
 * How long a model "thinks" before its move lands. Instant replies read as
 * a bug to the human opponent (you move and it is immediately your turn
 * again), so each AI turn is paced like a quick human one. Jitter keeps
 * back-to-back moves from feeling metronomic.
 */
const AI_MOVE_DELAY_BASE_MS = 900;
const AI_MOVE_DELAY_JITTER_MS = 500;
let aiMoveDelayOverrideMs: number | null = null;

/** Test seam: pace AI turns deterministically (0 = instant). */
export function setAiMoveDelayForTests(ms: number): void {
  aiMoveDelayOverrideMs = ms;
}

export function resetAiMoveDelayForTests(): void {
  aiMoveDelayOverrideMs = null;
}

function aiMoveDelayMs(): number {
  if (aiMoveDelayOverrideMs !== null) return aiMoveDelayOverrideMs;
  return AI_MOVE_DELAY_BASE_MS + Math.random() * AI_MOVE_DELAY_JITTER_MS;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Plays out every consecutive AI turn in `gameId`, pacing each move and
 * broadcasting it as its own gameStateUpdated (and gameResult when a move
 * ends the game). No-op when the player to move is human, the game is done,
 * or the id is unknown. Model-vs-model games chain here, one paced move at
 * a time. Errors are logged — a failed AI turn leaves a playable game.
 */
export async function runAiTurns(io: GameServer, gameId: string): Promise<void> {
  for (;;) {
    let outcome;
    try {
      await sleep(aiMoveDelayMs());
      outcome = await maybeFireAiMove(gameId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`AI turn failed for game ${gameId}:`, err);
      return;
    }
    if (!outcome) return;
    sendViewUpdates(io, gameId, outcome.views);
    if (outcome.gameResult) {
      io.to(gameId).emit("gameResult", { gameId, ...outcome.gameResult });
      return;
    }
  }
}

/**
 * Delivers a move's view updates: watcher view to the game room, each
 * player's view to their private room. Exported because server-originated
 * moves (a queued model opening the game) must broadcast the same way
 * socket-originated moves do.
 */
export function sendViewUpdates(io: GameServer, gameId: string, updates: GameViewUpdates) {
  io.to(gameId).emit("gameStateUpdated", { ...updates.watchers, forPlayer: false });
  for (const { userId, view } of updates.players) {
    io.to(userRoom(gameId, userId)).emit("gameStateUpdated", { ...view, forPlayer: true });
  }
  // Relay the watcher view to any live broadcasts of this game, each after its
  // broadcaster-set delay (Story 3.7). Best-effort and fire-and-forget so it
  // never blocks or breaks the live gameplay update above.
  void relayGameViewToBroadcasts(io, gameId, updates.watchers);
}

/**
 * Handle the socket request sent by a user when they try to join a game.
 */
export const socketJoinAsPlayer: SocketAPI = (socket, io) => async (body) => {
  try {
    const { auth, payload: gameId } = withAuth(z.string()).parse(body);
    const user = await enforceAuth(auth);
    const game = await joinGame(gameId, user);

    // Let everyone know the user joined (`io` instead of `socket` includes
    // the joiner)
    io.to(gameId).emit("gamePlayersUpdated", game.players);

    // This socket should receive user-specific updates for this game, if it
    // isn't already
    if (!socket.rooms.has(userRoom(gameId, user.userId))) {
      await socket.join(userRoom(gameId, user.userId));
    }

    // If the game is full, it starts automatically
    if (game.players.length === gameServices[game.type].maxPlayers) {
      sendViewUpdates(io, gameId, await startGame(gameId, user));
    }
  } catch (err) {
    logSocketError(socket, err);
  }
};

/**
 * Handle a request to start the game.
 */
export const socketStart: SocketAPI = (socket, io) => async (body) => {
  try {
    const { auth, payload: gameId } = withAuth(z.string()).parse(body);
    const user = await enforceAuth(auth);
    sendViewUpdates(io, gameId, await startGame(gameId, user));
  } catch (err) {
    logSocketError(socket, err);
  }
};

/**
 * Handle a request to make a move in a game.
 */
export const socketMakeMove: SocketAPI = (socket, io) => async (body) => {
  try {
    const {
      auth,
      payload: { gameId, move },
    } = withAuth(zGameMakeMovePayload).parse(body);
    const user = await enforceAuth(auth);
    const { views, gameResult } = await updateGame(gameId, user, move);
    sendViewUpdates(io, gameId, views);
    if (gameResult) {
      io.to(gameId).emit("gameResult", { gameId, ...gameResult });
    } else {
      // If a model is on turn now, its paced reply broadcasts separately.
      void runAiTurns(io, gameId);
    }
  } catch (err) {
    logSocketError(socket, err);
  }
};
