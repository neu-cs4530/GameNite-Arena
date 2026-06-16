import { type GameInfo, type GameKey, type TaggedGameView } from "@gamenite/shared";
import { createChat } from "./chat.service.ts";
import { matchRecorder } from "./matchRecorder.service.ts";
import { updateRatingsForGame } from "./rating.service.ts";
import { populateSafeUserInfo } from "./user.service.ts";
import { type GameServicer } from "../games/gameServiceManager.ts";
import { nimGameService } from "../games/nim.ts";
import { guessGameService } from "../games/guess.ts";
import { ticTacToeGameService } from "../games/tictactoe.ts";
import { connect4GameService } from "../games/connect4.ts";
import { checkersGameService } from "../games/checkers.ts";
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
  tictactoe: ticTacToeGameService,
  connect4: connect4GameService,
  checkers: checkersGameService,
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
 *
 * Exported so the replay analyzer feeds models the SAME per-game encoding the
 * live AI-move loop uses, instead of a hardcoded placeholder.
 */
export function encodeStateForInference(gameKey: GameKey, state: unknown): Record<string, unknown> {
  if (gameKey === "nim") {
    const s = state as { remaining: number; nextPlayer: number };
    return { remaining: s.remaining };
  }
  if (gameKey === "guess") {
    return { low: 1, high: 100 };
  }
  // Board games: encode player-relative (1 = side to move, -1 = opponent,
  // 0 = empty), matching the Python encoders in ai/inference-service.
  if (gameKey === "tictactoe") {
    const s = state as { board: string[][]; nextPlayer: number };
    const mine = s.nextPlayer === 0 ? "O" : "X";
    const board = s.board.flat().map((c) => (c === "." ? 0 : c === mine ? 1 : -1));
    return { board };
  }
  if (gameKey === "connect4") {
    const s = state as { board: string[][]; nextPlayer: number };
    const mine = s.nextPlayer === 0 ? "R" : "Y";
    const board = s.board.map((row) => row.map((c) => (c === "." ? 0 : c === mine ? 1 : -1)));
    return { board };
  }
  if (gameKey === "checkers") {
    // The Python encoder one-hots the raw piece strings over the 32 dark
    // squares (row-major, where row + col is odd) — not player-relative.
    const s = state as { board: string[][] };
    const squares: string[] = [];
    for (let r = 0; r < 8; r += 1) {
      for (let c = 0; c < 8; c += 1) {
        if ((r + c) % 2 === 1) squares.push(s.board[r][c]);
      }
    }
    return { squares };
  }
  return state as Record<string, unknown>;
}

/** What updateGame resolves to: view updates plus the result of a finished rated game. */
export interface GameUpdateOutcome {
  views: GameViewUpdates;
  gameResult: MatchResult | undefined;
}

/**
 * Ask the deployed model for its move, loading it on demand. The inference box
 * keeps an in-memory registry that resets on restart, and a model deployed
 * while inference had no INFERENCE_SERVICE_URL was never loaded — both leave the
 * box answering /move with 404 "no such deployment". On that 404 we pull-and-
 * load the model once (storage -> box handoff) and retry, so the live AI path
 * self-heals instead of assuming deploy-time loading survived in a separate
 * process. Any other error propagates to the caller's handling.
 */
async function requestAiMoveWithLoad(
  ai: AIParticipant,
  gameType: GameKey,
  rawState: unknown,
  legalMoves: unknown[] | undefined,
): Promise<unknown> {
  const ask = (): Promise<unknown> =>
    inferenceClient.requestMove({
      deploymentId: ai.deploymentId,
      state: encodeStateForInference(gameType, rawState),
      legalMoves,
    });
  try {
    return await ask();
  } catch (err) {
    if (err instanceof inferenceClient.InferenceError && err.status === 404) {
      await inferenceClient.loadModel({
        deploymentId: ai.deploymentId,
        game: gameType,
        modelId: ai.modelId,
      });
      return await ask();
    }
    throw err;
  }
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

  // Checkers uses a dynamic action space: the model outputs an index into the
  // legal-moves list, so we must supply that list at inference time (CoS 2.6).
  let legalMovesForInference: unknown[] | undefined;
  if (game.type === "checkers") {
    // view(-1) returns the watcher view which includes legalMoves for the
    // current player — the same list the inference service needs to decode
    // the model's action index into a concrete squares sequence (CoS 2.6).
    const tagged = checkersGameService.view(game.state, -1);
    const inner = (tagged as { view?: { legalMoves?: unknown[] } }).view;
    legalMovesForInference = inner?.legalMoves ?? [];
  }

  let move: unknown;
  try {
    const result = (await requestAiMoveWithLoad(
      aiParticipant,
      game.type,
      game.state,
      legalMovesForInference,
    )) as { move: unknown };
    move = result.move;
  } catch (err) {
    if (err instanceof inferenceClient.InferenceError) {
      // CoS 2.8 bookkeeping: persist the model's consecutive-invalid streak
      // for observability, and forfeit the game on the third strike.
      if (typeof err.consecutiveInvalid === "number") {
        game.invalidMoveStreaks = {
          ...game.invalidMoveStreaks,
          [nextPlayerIndex]: err.consecutiveInvalid,
        };
        await GameRepo.set(gameId, game);
      }
      if (err.forfeit) {
        return forfeitAiSeat(gameId, nextPlayerIndex);
      }
      // Service unreachable (503) after the client's own retries: this is an
      // infrastructure outage, NOT the model playing an invalid move, so it is
      // wrong to score it as a forfeit-loss against the AI's owner. But the
      // move can't land, and leaving the game on the AI's turn would hang it
      // forever (the human waits indefinitely). End it as a no-decision
      // "abandoned" — no winner, no rating change — and surface a clear log.
      // (`consecutiveInvalid` is absent on a 503; the streak/forfeit branches
      // above never fire for it.)
      // Infra failures that aren't the model's fault and can't land the move:
      // 503 service unreachable, 502 the model's artifact couldn't be pulled to
      // the box, 404 the model couldn't be loaded even after the retry above.
      // None is a forfeit; ending on the AI's turn would hang the match, so end
      // it as a no-decision "abandoned".
      if (err.status === 503 || err.status === 502 || err.status === 404) {
        // eslint-disable-next-line no-console
        console.error(
          `AI move abandoned for deployment ${aiDeploymentId}: inference could not serve the move — ${err.message}`,
        );
        return abandonAiGame(gameId);
      }
    }
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

/**
 * Ends a game as an AI forfeit (CoS 2.8): the model in `forfeitingSeat`
 * struck out on consecutive invalid moves, so the OTHER seat wins. Marks the
 * game done, archives the match with outcome "forfeit", applies rating
 * updates for rated games, and returns the outcome so gameResult emits. The
 * returned views show the last accepted position — the forfeit was decided
 * off the board.
 */
async function forfeitAiSeat(gameId: string, forfeitingSeat: number): Promise<GameUpdateOutcome> {
  const game = await GameRepo.get(gameId);
  const winnerId = game.players[forfeitingSeat === 0 ? 1 : 0];

  game.done = true;
  game.matchId = gameId;
  await GameRepo.set(gameId, game);

  try {
    await matchRecorder.finalizeAsForfeit(game, gameId, winnerId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`match capture failed for game ${gameId}:`, err);
  }

  let gameResult: MatchResult = { winnerId, outcome: "forfeit" };
  if (game.rated) {
    try {
      const ratedResult = await updateRatingsForGame(game, gameId, {
        winnerId,
        outcome: "forfeit",
      });
      gameResult = ratedResult ?? gameResult;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`rating update failed for game ${gameId}:`, err);
    }
  }

  const service = gameServices[game.type];
  return {
    views: {
      watchers: service.view(game.state, -1),
      players: game.players.map((userId, index) => ({
        userId,
        view: service.view(game.state, index),
      })),
    },
    gameResult,
  };
}

/**
 * Ends a game as a no-decision abandonment when the inference service is
 * unreachable and an AI move cannot land (the prod 503 / "fetch failed"
 * path). Unlike a forfeit this has NO winner and applies NO rating change —
 * an outage is not the model's fault, so neither seat is penalized — but the
 * game is marked done and the outcome surfaced so a live match never hangs on
 * the AI's turn. The returned views show the last accepted position.
 */
async function abandonAiGame(gameId: string): Promise<GameUpdateOutcome> {
  const game = await GameRepo.get(gameId);

  game.done = true;
  game.matchId = gameId;
  await GameRepo.set(gameId, game);

  try {
    await matchRecorder.finalizeAsAbandoned(gameId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`match capture failed for game ${gameId}:`, err);
  }

  const gameResult: MatchResult = { outcome: "abandoned" };
  const service = gameServices[game.type];
  return {
    views: {
      watchers: service.view(game.state, -1),
      players: game.players.map((userId, index) => ({
        userId,
        view: service.view(game.state, index),
      })),
    },
    gameResult,
  };
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

  // NOTE: an AI reply is deliberately NOT fired here. The controller
  // schedules it (runAiTurns) so the human's move broadcasts first and the
  // model's answer lands as its own paced, separately delivered turn.
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
