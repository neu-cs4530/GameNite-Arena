import { type GameInfo, type GameKey, type TaggedGameView } from "@gamenite/shared";
import { createChat } from "./chat.service.ts";
import { matchRecorder } from "./matchRecorder.service.ts";
import { updateRatingsForGame } from "./rating.service.ts";
import { populateSafeUserInfo } from "./user.service.ts";
import { type GameServicer } from "../games/gameServiceManager.ts";
import { nimGameService } from "../games/nim.ts";
import { guessGameService } from "../games/guess.ts";
import { type GameViewUpdates, type UserWithId } from "../types.ts";
import { type AIParticipant, type MatchResult } from "../models.ts";
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
 *
 * @param gameId - Valid game id
 * @returns the expanded game info object
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
    return { low: 1, high: 100 };
  }
  return state as Record<string, unknown>;
}

/** What updateGame resolves to: view updates plus the result of a finished rated game. */
export interface GameUpdateOutcome {
  views: GameViewUpdates;
  gameResult: MatchResult | undefined;
}

/**
 * If the next player to move is an AI deployment, fire its move automatically.
 * Returns the full update outcome of the AI's move (which itself chains into
 * the next AI move for model-vs-model games), or null if no AI move was made.
 * A game-ending AI move carries its MatchResult in the outcome so callers can
 * emit gameResult.
 *
 * CoS 2.6: deployed model plays ranked matches automatically.
 * CoS 2.8: forfeit after 3 consecutive invalid moves (tracked in inference service).
 */
export async function maybeFireAiMove(gameId: string): Promise<GameUpdateOutcome | null> {
  const game = await GameRepo.find(gameId);
  if (!game?.state || game.done) return null;

  const state = game.state as Record<string, unknown>;
  const nextPlayerIndex = typeof state["nextPlayer"] === "number" ? state["nextPlayer"] : null;
  if (nextPlayerIndex === null) return null;

  const aiParticipant = game.aiPlayers?.[nextPlayerIndex];
  if (!aiParticipant) return null;
  const aiDeploymentId = aiParticipant.deploymentId;

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
  rated = false,
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
    rated,
  });
  return populateGameInfo(gameId);
}

/**
 * Creates a game with a deployed model in seat 0 (CoS 2.6). The model's seat
 * id in `players` is its deployment id, positionally mirrored in `aiPlayers`
 * so the AI move loop knows whose turn it is.
 */
export async function createGameWithAi(
  ai: AIParticipant,
  type: GameKey,
  createdAt: Date,
  rated = false,
): Promise<GameInfo> {
  const chat = await createChat(createdAt);
  const gameId = await GameRepo.add({
    type,
    done: false,
    chat: chat.chatId,
    createdAt: createdAt.toISOString(),
    createdBy: ai.deploymentId,
    players: [ai.deploymentId],
    aiPlayers: [ai],
    rated,
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

/**
 * Seats a deployed model in an open game (CoS 2.6), the AI counterpart of
 * {@link joinGame}: the deployment id joins `players` and the participant
 * lands at the same index of `aiPlayers` (human seats are padded with null).
 */
export async function joinGameAsAi(gameId: string, ai: AIParticipant): Promise<GameInfo> {
  const game = await GameRepo.find(gameId);
  if (!game) throw new Error(`deployment ${ai.deploymentId} joining invalid game`);
  if (game.state) {
    throw new Error(`deployment ${ai.deploymentId} joining game that started`);
  }
  if (game.players.some((seatId) => seatId === ai.deploymentId)) {
    throw new Error(`deployment ${ai.deploymentId} joining game it is in already`);
  }
  if (game.players.length === gameServices[game.type].maxPlayers) {
    throw new Error(`deployment ${ai.deploymentId} joining full`);
  }

  const aiPlayers = [...game.aiPlayers];
  while (aiPlayers.length < game.players.length) aiPlayers.push(null);

  game.players = [...game.players, ai.deploymentId];
  game.aiPlayers = [...aiPlayers, ai];
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

/**
 * Updates a game state and returns the necessary view updates
 *
 * @param gameId - Ostensible game id
 * @param user - Authenticated user
 * @param move - Unsanitized game move
 * @returns the view updates to send to players and watchers, plus the match
 * result (winner, outcome, rating changes) if this move ended a rated game
 * @throws if the game id or move is not valid
 */
export async function updateGame(
  gameId: string,
  user: UserWithId,
  move: unknown,
): Promise<GameUpdateOutcome> {
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

  // Glicko rating updates for rated games that just ended.
  let gameResult: MatchResult | undefined;
  if (result.done && game.rated) {
    try {
      gameResult = await updateRatingsForGame(game, gameId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`rating update failed for game ${gameId}:`, err);
    }
  }

  // After a move, check if the next player is an AI and fire its move.
  // Best-effort: an AI failure must not roll back the move that was just
  // accepted. When the AI's move finishes the game, its MatchResult is
  // returned from THIS call so the controller still emits gameResult.
  if (!result.done) {
    try {
      const aiOutcome = await maybeFireAiMove(gameId);
      if (aiOutcome) return aiOutcome;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`AI follow-up move failed for game ${gameId}:`, err);
    }
  }

  return { views: result.views, gameResult };
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
