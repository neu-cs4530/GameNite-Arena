import { type GameInfo, type GameKey, type TaggedGameView } from "@gamenite/shared";
import { createChat } from "./chat.service.ts";
import { matchRecorder } from "./matchRecorder.service.ts";
import { populateSafeUserInfo } from "./user.service.ts";
import { type GameServicer } from "../games/gameServiceManager.ts";
import { nimGameService } from "../games/nim.ts";
import { guessGameService } from "../games/guess.ts";
import { type GameViewUpdates, type UserWithId } from "../types.ts";
import { GameRepo } from "../repository.ts";
import * as inferenceClient from "./inferenceClient.ts";

/**
 * The service interface for individual games
 */
export const gameServices: { [key in GameKey]: GameServicer } = {
  nim: nimGameService,
  guess: guessGameService,
};

/**
 * Expand a stored game
 */
async function populateGameInfo(gameId: string): Promise<GameInfo> {
  const game = await GameRepo.get(gameId);
  return {
    gameId,
    createdBy: await populateSafeUserInfo(game.createdBy),
    chat: game.chat,
    createdAt: new Date(game.createdAt),
    players: await Promise.all(game.players.map(populateSafeUserInfo)),
    type: game.type,
    status: !game.state ? "waiting" : game.done ? "done" : "active",
    minPlayers: gameServices[game.type].minPlayers,
  };
}

/**
 * Build the state payload for the inference service from the raw game state.
 * Must match the observation encoding in ai/inference-service/encoders.py.
 */
function encodeStateForInference(gameKey: GameKey, state: unknown): Record<string, unknown> {
  if (gameKey === "nim") {
    const s = state as { remaining: number; nextPlayer: number };
    return { remaining: s.remaining };
  }
  if (gameKey === "guess") {
    // AI sees the feasible range [1, 100] — it doesn't know the secret.
    return { low: 1, high: 100 };
  }
  // Fallback for future games — pass state as-is and let the encoder handle it.
  return state as Record<string, unknown>;
}

/**
 * If the next player to move is an AI deployment, fire its move automatically.
 * Returns updated views if an AI move was made, null otherwise.
 *
 * CoS 2.6: deployed model plays ranked matches automatically.
 * CoS 2.8: forfeit after 3 consecutive invalid moves (tracked in inference service).
 */
async function maybeFireAiMove(gameId: string): Promise<GameViewUpdates | null> {
  const game = await GameRepo.find(gameId);
  if (!game?.state || game.done) return null;

  // Find which player moves next (games expose nextPlayer in their state).
  const state = game.state as Record<string, unknown>;
  const nextPlayerIndex = typeof state["nextPlayer"] === "number" ? state["nextPlayer"] : null;
  if (nextPlayerIndex === null) return null;

  // Check if that player index maps to an AI deployment.
  const aiParticipant = game.aiPlayers?.[nextPlayerIndex];
  if (!aiParticipant) return null;
  const aiDeploymentId = aiParticipant.deploymentId;

  // Ask the inference service for a move.
  let move: unknown;
  try {
    const result = (await inferenceClient.requestMove({
      deploymentId: aiDeploymentId,
      state: encodeStateForInference(game.type, game.state),
    })) as { move: unknown };
    move = result.move;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`AI move failed for deployment ${aiDeploymentId}:`, err);
    return null;
  }

  // Build a synthetic user for the AI so updateGame can authorize the move.
  const aiUser: UserWithId = {
    userId: game.players[nextPlayerIndex] ?? aiDeploymentId,
    username: `ai:${aiDeploymentId}`,
  };

  return updateGame(gameId, aiUser, move);
}

export async function createGame(
  user: UserWithId,
  type: GameKey,
  createdAt: Date,
): Promise<GameInfo> {
  const chat = await createChat(createdAt);
  const gameId = await GameRepo.add({
    type,
    done: false,
    chat: chat.chatId,
    createdAt: createdAt.toISOString(),
    createdBy: user.userId,
    players: [user.userId],
    aiPlayers: [],
    rated: false,
  });
  return populateGameInfo(gameId);
}

export async function getGameById(gameId: string): Promise<GameInfo | null> {
  const game = await GameRepo.find(gameId);
  if (!game) return null;
  return populateGameInfo(gameId);
}

export async function joinGame(gameId: string, user: UserWithId): Promise<GameInfo> {
  const game = await GameRepo.find(gameId);
  if (!game) throw new Error(`user ${user.username} joining invalid game`);
  if (game.state) {
    throw new Error(`user ${user.username} joining game that started`);
  }
  if (game.players.some((userId) => userId === user.userId)) {
    throw new Error(`user ${user.username} joining game they are in already`);
  }
  if (game.players.length === gameServices[game.type].maxPlayers) {
    throw new Error(`user ${user.username} joining full`);
  }

  game.players = [...game.players, user.userId];
  await GameRepo.set(gameId, game);

  return populateGameInfo(gameId);
}

export async function startGame(gameId: string, user: UserWithId): Promise<GameViewUpdates> {
  const game = await GameRepo.find(gameId);
  if (!game) throw new Error(`user ${user.username} starting invalid game`);
  if (game.state) {
    throw new Error(`user ${user.username} starting game that started`);
  }

  const key: GameKey = game.type;

  if (game.players.length < gameServices[key].minPlayers) {
    throw new Error(`user ${user.username} starting underpopulated game`);
  }
  if (!game.players.some((userId) => userId === user.userId)) {
    throw new Error(`user ${user.username} starting game they're not in`);
  }
  const { state, views } = gameServices[key].create(game.players);

  game.state = state;
  await GameRepo.set(gameId, game);

  return views;
}

export async function getGames(): Promise<GameInfo[]> {
  const keys = await GameRepo.getAllKeys();
  const unsorted = await Promise.all(keys.map(populateGameInfo));

  return unsorted.toSorted((game1, game2) => game2.createdAt.getTime() - game1.createdAt.getTime());
}

export async function updateGame(
  gameId: string,
  user: UserWithId,
  move: unknown,
): Promise<GameViewUpdates> {
  const game = await GameRepo.find(gameId);
  if (!game) throw new Error(`user ${user.username} acted on an invalid game`);
  if (!game.state) {
    throw new Error(`user ${user.username} made a move in game of that hadn't started`);
  }
  const playerIndex = game.players.findIndex((userId) => userId === user.userId);
  if (playerIndex < 0) {
    throw new Error(`user ${user.username} made a move in a game they weren't playing`);
  }
  const service = gameServices[game.type];
  const result = service.update(game.state, move, playerIndex, game.players);
  if (!result) throw new Error(`user ${user.username} made an invalid move in ${game.type}`);

  const stateBeforeMove = game.state;
  game.state = result.state;
  game.done = game.done || result.done;
  if (result.done) game.matchId = gameId;
  await GameRepo.set(gameId, game);

  const winnerId =
    typeof result.winnerIndex === "number" ? game.players[result.winnerIndex] : result.winnerIndex;

  const canonicalMove = service.parseMove(move) ?? move;

  try {
    await matchRecorder.captureMove(
      game,
      gameId,
      user.userId,
      canonicalMove,
      result.done,
      stateBeforeMove,
      winnerId,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`match capture failed for game ${gameId}:`, err);
  }

  // After a human move, check if the next player is an AI and fire its move.
  // Best-effort: an AI failure must not roll back the human move.
  if (!result.done) {
    try {
      const aiViews = await maybeFireAiMove(gameId);
      if (aiViews) return aiViews;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`AI follow-up move failed for game ${gameId}:`, err);
    }
  }

  return result.views;
}

export async function viewGame(gameId: string, user: UserWithId) {
  const game = await GameRepo.find(gameId);
  if (!game) throw new Error(`user ${user.username} viewed an invalid game id`);
  const playerIndex = game.players.findIndex((userId) => userId === user.userId);
  let view: TaggedGameView | null = null;
  if (game.state) {
    view = gameServices[game.type].view(game.state, playerIndex);
  }
  return {
    isPlayer: playerIndex >= 0,
    view,
    players: await Promise.all(game.players.map(populateSafeUserInfo)),
  };
}
