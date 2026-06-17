import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { NimView } from "@gamenite/shared";
import { ratingKey, type AIParticipant, type GameRecord } from "../../src/models.ts";
import { DeploymentRepo, GameRepo, MatchRepo, RatingRepo } from "../../src/repository.ts";
import { getUserByUsername } from "../../src/services/auth.service.ts";
import {
  createGame,
  createGameWithAi,
  forfeitGame,
  getGameById,
  joinGame,
  joinGameAsAi,
  maybeFireAiMove,
  startGame,
  updateGame,
  viewGame,
} from "../../src/services/game.service.ts";
import { matchRecorder } from "../../src/services/matchRecorder.service.ts";
import {
  InferenceError,
  resetInferenceClientForTests,
  setInferenceClientForTests,
} from "../../src/services/inferenceClient.ts";
import { DEFAULT_RATING } from "../../src/services/glicko2.service.ts";
import type { UserWithId } from "../../src/types.ts";

/* ---------------------------------------------------------------------------
 * The AI move loop (CoS 2.6): updateGame returns ONLY the human's own move;
 * each AI turn is driven explicitly through maybeFireAiMove (one move per
 * call), and a game-ending AI move carries its MatchResult in that call's
 * outcome so the controller can emit gameResult. Inference responses are
 * scripted through the client seam — the python service never runs here.
 * ------------------------------------------------------------------------- */

const botSeat: AIParticipant = {
  deploymentId: "dep-loop",
  modelId: "model-loop",
  displayName: "LoopBot",
};

let user0: UserWithId;

/** Scripts the inference service to return each move in turn. */
function scriptAiMoves(...moves: number[]): ReturnType<typeof vi.fn> {
  const requestMove = vi.fn();
  for (const move of moves) {
    requestMove.mockResolvedValueOnce({ move });
  }
  setInferenceClientForTests({ requestMove });
  return requestMove;
}

/** Seeds a started nim game with the given seats and state. */
async function seedNimGame(args: {
  players: string[];
  aiPlayers: (AIParticipant | null)[];
  state: { remaining: number; nextPlayer: number };
  rated?: boolean;
}): Promise<string> {
  const gameId = randomUUID().toString();
  const game: GameRecord = {
    type: "nim",
    state: args.state,
    done: false,
    chat: "chat-ai-loop",
    players: args.players,
    aiPlayers: args.aiPlayers,
    rated: args.rated ?? true,
    createdAt: new Date().toISOString(),
    createdBy: args.players[0],
  };
  await GameRepo.set(gameId, game);
  return gameId;
}

function nimView(views: { watchers: { type: string; view: unknown } }): NimView {
  return views.watchers.view as NimView;
}

beforeEach(async () => {
  await RatingRepo.clear();
  user0 = (await getUserByUsername("user0"))!;
});

afterEach(() => {
  resetInferenceClientForTests();
  vi.restoreAllMocks();
});

describe("updateGame with an AI opponent", () => {
  it("returns only the human's own move — the AI reply is a separate paced turn", async () => {
    const requestMove = scriptAiMoves(2);
    const gameId = await seedNimGame({
      players: [user0.userId, botSeat.deploymentId],
      aiPlayers: [null, botSeat],
      state: { remaining: 21, nextPlayer: 0 },
    });

    const { views, gameResult } = await updateGame(gameId, user0, 3);

    // The human's broadcastable state shows ONLY their move; the model has
    // not answered yet (the controller schedules that separately so the
    // opponent never experiences an instant reply).
    expect(gameResult).toBeUndefined();
    expect(nimView(views)).toEqual({ remaining: 18, nextPlayer: 1 });
    expect(requestMove).not.toHaveBeenCalled();

    const reply = await maybeFireAiMove(gameId);
    expect(reply?.gameResult).toBeUndefined();
    expect(nimView(reply!.views)).toEqual({ remaining: 16, nextPlayer: 0 });
    expect(requestMove).toHaveBeenCalledExactlyOnceWith({
      deploymentId: botSeat.deploymentId,
      state: { remaining: 18 },
    });

    const stored = await GameRepo.get(gameId);
    expect(stored.state).toEqual({ remaining: 16, nextPlayer: 0 });
    expect(stored.done).toBe(false);
  });

  it("the AI's own turn carries the MatchResult when it ends a rated game", async () => {
    scriptAiMoves(1);
    const gameId = await seedNimGame({
      players: [user0.userId, botSeat.deploymentId],
      aiPlayers: [null, botSeat],
      state: { remaining: 4, nextPlayer: 0 },
    });

    // Human takes 3, leaving 1; the AI must take the last object and lose
    // (misère nim) — its move, fired as its own turn, ends the game.
    const human = await updateGame(gameId, user0, 3);
    expect(human.gameResult).toBeUndefined();
    expect(nimView(human.views)).toEqual({ remaining: 1, nextPlayer: 1 });

    const reply = await maybeFireAiMove(gameId);
    const { views, gameResult } = reply!;

    expect(nimView(views)).toEqual({ remaining: 0, nextPlayer: 0 });
    expect(gameResult).toBeDefined();
    expect(gameResult!.outcome).toBe("win");
    expect(gameResult!.winnerId).toBe(user0.userId);
    expect(gameResult!.ratingChanges).toEqual([
      { entityId: user0.userId, delta: expect.any(Number) },
      { entityId: botSeat.modelId, delta: expect.any(Number) },
    ]);

    const stored = await GameRepo.get(gameId);
    expect(stored.done).toBe(true);
  });

  it("plays a full model-vs-human rated nim game with ratings on both keys", async () => {
    scriptAiMoves(2, 1, 3, 3);
    const gameId = await seedNimGame({
      players: [user0.userId, botSeat.deploymentId],
      aiPlayers: [null, botSeat],
      state: { remaining: 21, nextPlayer: 0 },
    });

    // 21 -h3-> 18 -a2-> 16 -h3-> 13 -a1-> 12 -h3-> 9 -a3-> 6 -h3-> 3 -a3-> 0
    // A human move NEVER carries the AI's reply anymore — the reply is a
    // separately scheduled, separately broadcast turn (paced for humans).
    const first = await updateGame(gameId, user0, 3);
    expect(first.gameResult).toBeUndefined();
    expect((await GameRepo.get(gameId)).state).toEqual({ remaining: 18, nextPlayer: 1 });
    const firstAi = await maybeFireAiMove(gameId);
    expect(firstAi?.gameResult).toBeUndefined();
    expect((await GameRepo.get(gameId)).state).toEqual({ remaining: 16, nextPlayer: 0 });

    await updateGame(gameId, user0, 3);
    await maybeFireAiMove(gameId);
    await updateGame(gameId, user0, 3);
    await maybeFireAiMove(gameId);
    const lastHuman = await updateGame(gameId, user0, 3);
    expect(lastHuman.gameResult).toBeUndefined();
    const last = await maybeFireAiMove(gameId);

    // The AI took the last object, so the human wins (misère nim).
    expect(last?.gameResult).toBeDefined();
    expect(last!.gameResult!.winnerId).toBe(user0.userId);
    expect(last!.gameResult!.outcome).toBe("win");

    // Ratings landed under the human key and the MODEL's ai key.
    const humanRecord = await RatingRepo.find(
      ratingKey({ entityType: "human", entityId: user0.userId, gameKey: "nim" }),
    );
    const modelRecord = await RatingRepo.find(
      ratingKey({ entityType: "ai", entityId: botSeat.modelId, gameKey: "nim" }),
    );
    expect(humanRecord!.rating).toBeGreaterThan(DEFAULT_RATING);
    expect(modelRecord!.rating).toBeLessThan(DEFAULT_RATING);
    expect(modelRecord!.gamesPlayed).toBe(1);

    // The archived match captured all eight moves with the AI acting under
    // its seat (deployment) id, and the model archived as an AI participant.
    const match = await MatchRepo.get(gameId);
    expect(match.moves).toHaveLength(8);
    expect(match.moves.map((m) => m.actor)).toEqual([
      user0.userId,
      botSeat.deploymentId,
      user0.userId,
      botSeat.deploymentId,
      user0.userId,
      botSeat.deploymentId,
      user0.userId,
      botSeat.deploymentId,
    ]);
    expect(match.participants).toContainEqual({
      id: botSeat.modelId,
      type: "ai",
      displayName: botSeat.displayName,
    });
    expect(match.result.outcome).toBe("win");
    expect(match.result.winnerId).toBe(user0.userId);
  });

  it("abandons the match (no winner) when inference is unreachable", async () => {
    // A 503 outage is not the model's fault, so the game is not forfeited
    // against the AI; but the move can't land, so rather than hang on the
    // AI's turn forever the match ends as a no-decision "abandoned". The
    // human's accepted move stays on the board as the final position.
    const requestMove = vi
      .fn()
      .mockRejectedValue(new InferenceError("Inference service unreachable: down", 503));
    setInferenceClientForTests({ requestMove });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const gameId = await seedNimGame({
      players: [user0.userId, botSeat.deploymentId],
      aiPlayers: [null, botSeat],
      state: { remaining: 21, nextPlayer: 0 },
    });

    const { views, gameResult } = await updateGame(gameId, user0, 3);

    expect(gameResult).toBeUndefined();
    expect(nimView(views)).toEqual({ remaining: 18, nextPlayer: 1 });

    // The AI turn can't reach inference: the match is abandoned, not hung.
    const outcome = await maybeFireAiMove(gameId);
    expect(outcome?.gameResult).toEqual({ outcome: "abandoned" });
    expect(outcome?.gameResult?.winnerId).toBeUndefined();
    const stored = await GameRepo.get(gameId);
    expect(stored.state).toEqual({ remaining: 18, nextPlayer: 1 });
    expect(stored.done).toBe(true);
    expect(consoleError).toHaveBeenCalled();
  });

  it("loads the model on demand on a 'no such deployment' 404, then retries the move", async () => {
    // The box's model registry is in-memory and resets on restart, and a model
    // deployed while inference had no URL was never loaded — both surface as a
    // 404 on /move. The live path must pull-and-load on that 404 and retry.
    const requestMove = vi
      .fn()
      .mockRejectedValueOnce(
        new InferenceError("Inference /inference/move failed: No such deployment", 404),
      )
      .mockResolvedValueOnce({ move: 2 });
    const loadModel = vi.fn().mockResolvedValue({ status: "loaded" });
    setInferenceClientForTests({ requestMove, loadModel });
    const gameId = await seedNimGame({
      players: [user0.userId, botSeat.deploymentId],
      aiPlayers: [null, botSeat],
      state: { remaining: 18, nextPlayer: 1 },
    });

    const reply = await maybeFireAiMove(gameId);

    expect(loadModel).toHaveBeenCalledExactlyOnceWith({
      deploymentId: botSeat.deploymentId,
      game: "nim",
      modelId: botSeat.modelId,
    });
    expect(requestMove).toHaveBeenCalledTimes(2);
    expect(reply).not.toBeNull();
    expect(nimView(reply!.views)).toEqual({ remaining: 16, nextPlayer: 0 });
  });

  it("abandons (no decision) when the model can't be loaded — e.g. its artifact is gone", async () => {
    // 404 on move -> load -> the box can't pull the .pth from the API (502).
    // Not the model's fault and not recoverable, so abandon rather than hang.
    const requestMove = vi
      .fn()
      .mockRejectedValue(
        new InferenceError("Inference /inference/move failed: No such deployment", 404),
      );
    const loadModel = vi
      .fn()
      .mockRejectedValue(
        new InferenceError("Inference /inference/load failed: artifact pull failed", 502),
      );
    setInferenceClientForTests({ requestMove, loadModel });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const gameId = await seedNimGame({
      players: [user0.userId, botSeat.deploymentId],
      aiPlayers: [null, botSeat],
      state: { remaining: 18, nextPlayer: 1 },
    });

    const outcome = await maybeFireAiMove(gameId);

    expect(outcome?.gameResult).toEqual({ outcome: "abandoned" });
    expect(loadModel).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalled();
  });

  it("keeps the human move when the AI's move is illegal for the game", async () => {
    scriptAiMoves(15); // larger than remaining: nim rejects it
    const gameId = await seedNimGame({
      players: [user0.userId, botSeat.deploymentId],
      aiPlayers: [null, botSeat],
      state: { remaining: 10, nextPlayer: 0 },
    });

    const { views, gameResult } = await updateGame(gameId, user0, 3);

    expect(gameResult).toBeUndefined();
    expect(nimView(views)).toEqual({ remaining: 7, nextPlayer: 1 });

    // The illegal AI move surfaces as a throw out of maybeFireAiMove (the
    // controller loop logs it); the human's accepted move is untouched.
    await expect(maybeFireAiMove(gameId)).rejects.toThrow(/invalid move/);
    const stored = await GameRepo.get(gameId);
    expect(stored.state).toEqual({ remaining: 7, nextPlayer: 1 });
    expect(stored.done).toBe(false);
  });
});

describe("maybeFireAiMove", () => {
  it("lets a model on seat 0 open the game", async () => {
    scriptAiMoves(3);
    const gameId = await seedNimGame({
      players: [botSeat.deploymentId, user0.userId],
      aiPlayers: [botSeat, null],
      state: { remaining: 21, nextPlayer: 0 },
    });

    const outcome = await maybeFireAiMove(gameId);

    expect(outcome).not.toBeNull();
    expect(nimView(outcome!.views)).toEqual({ remaining: 18, nextPlayer: 1 });
    expect(outcome!.gameResult).toBeUndefined();
  });

  it("chains model-vs-model play to completion and returns the result", async () => {
    const otherSeat: AIParticipant = {
      deploymentId: "dep-other",
      modelId: "model-other",
      displayName: "OtherBot",
    };
    // Both models always take 3: 21→18→15→12→9→6→3→0 over seven moves, so
    // seat 0 takes the last object and seat 1 wins (misère nim).
    const requestMove = vi.fn().mockResolvedValue({ move: 3 });
    setInferenceClientForTests({ requestMove });
    const gameId = await seedNimGame({
      players: [botSeat.deploymentId, otherSeat.deploymentId],
      aiPlayers: [botSeat, otherSeat],
      state: { remaining: 21, nextPlayer: 0 },
    });

    // One AI move per call: the controller loop drives the chain, so the
    // spec drives it the same way until a move ends the game.
    let outcome: Awaited<ReturnType<typeof maybeFireAiMove>> = null;
    for (let turn = 0; turn < 7; turn++) {
      outcome = await maybeFireAiMove(gameId);
      expect(outcome).not.toBeNull();
      if (outcome!.gameResult) break;
    }

    expect(outcome).not.toBeNull();
    expect(outcome!.gameResult).toBeDefined();
    expect(outcome!.gameResult!.winnerId).toBe(otherSeat.deploymentId);
    expect(outcome!.gameResult!.ratingChanges).toEqual([
      { entityId: botSeat.modelId, delta: expect.any(Number) },
      { entityId: otherSeat.modelId, delta: expect.any(Number) },
    ]);
    expect(outcome!.gameResult!.ratingChanges![0].delta).toBeLessThan(0);
    expect(outcome!.gameResult!.ratingChanges![1].delta).toBeGreaterThan(0);
    expect(requestMove).toHaveBeenCalledTimes(7);

    const stored = await GameRepo.get(gameId);
    expect(stored.done).toBe(true);
  });

  it("returns null for an unknown game", async () => {
    expect(await maybeFireAiMove(randomUUID().toString())).toBeNull();
  });

  it("returns null for a game that has not started", async () => {
    const gameId = randomUUID().toString();
    await GameRepo.set(gameId, {
      type: "nim",
      done: false,
      chat: "chat-x",
      players: [botSeat.deploymentId],
      aiPlayers: [botSeat],
      rated: false,
      createdAt: new Date().toISOString(),
      createdBy: botSeat.deploymentId,
    });
    expect(await maybeFireAiMove(gameId)).toBeNull();
  });

  it("returns null for a finished game", async () => {
    const gameId = await seedNimGame({
      players: [botSeat.deploymentId, user0.userId],
      aiPlayers: [botSeat, null],
      state: { remaining: 0, nextPlayer: 0 },
    });
    const game = await GameRepo.get(gameId);
    game.done = true;
    await GameRepo.set(gameId, game);
    expect(await maybeFireAiMove(gameId)).toBeNull();
  });

  it("returns null when the game state has no nextPlayer", async () => {
    const gameId = randomUUID().toString();
    await GameRepo.set(gameId, {
      type: "guess",
      state: { secret: 50, guesses: [null, null] },
      done: false,
      chat: "chat-x",
      players: [user0.userId, botSeat.deploymentId],
      aiPlayers: [null, botSeat],
      rated: false,
      createdAt: new Date().toISOString(),
      createdBy: user0.userId,
    });
    expect(await maybeFireAiMove(gameId)).toBeNull();
  });

  it("returns null when it is a human's turn", async () => {
    const gameId = await seedNimGame({
      players: [user0.userId, botSeat.deploymentId],
      aiPlayers: [null, botSeat],
      state: { remaining: 21, nextPlayer: 0 },
    });
    expect(await maybeFireAiMove(gameId)).toBeNull();
  });
});

describe("createGameWithAi / joinGameAsAi", () => {
  /** Registers botSeat's deployment so AI seats can be rendered in GameInfo. */
  async function seedBotDeployment(): Promise<void> {
    await DeploymentRepo.set(botSeat.deploymentId, {
      modelId: botSeat.modelId,
      userId: user0.userId,
      gameKey: "nim",
      displayName: botSeat.displayName,
      status: "active",
      createdAt: "2026-06-02T00:00:00.000Z",
      updatedAt: "2026-06-02T00:00:00.000Z",
    });
  }

  it("creates a game with the model in seat 0, rendered as an AI user", async () => {
    await seedBotDeployment();

    const info = await createGameWithAi(botSeat, "nim", new Date(), true);

    expect(info.status).toBe("waiting");
    expect(info.players).toHaveLength(1);
    expect(info.players[0]).toStrictEqual({
      username: botSeat.deploymentId,
      display: botSeat.displayName,
      createdAt: new Date("2026-06-02T00:00:00.000Z"),
      isAi: true,
    });
    expect(info.createdBy.isAi).toBe(true);

    const stored = await GameRepo.get(info.gameId);
    expect(stored.players).toEqual([botSeat.deploymentId]);
    expect(stored.aiPlayers).toEqual([botSeat]);
    expect(stored.rated).toBe(true);
  });

  it("joins a model into seat 1 of a human-created game, keeping seats positional", async () => {
    await seedBotDeployment();
    const game = await createGame(user0, "nim", new Date(), true);

    const info = await joinGameAsAi(game.gameId, botSeat);

    expect(info.players).toHaveLength(2);
    expect(info.players[0].isAi).toBeUndefined();
    expect(info.players[1].isAi).toBe(true);

    const stored = await GameRepo.get(game.gameId);
    expect(stored.players).toEqual([user0.userId, botSeat.deploymentId]);
    expect(stored.aiPlayers).toEqual([null, botSeat]);
  });

  it("lets a human join and start an AI-created game", async () => {
    await seedBotDeployment();
    const game = await createGameWithAi(botSeat, "nim", new Date(), true);
    await joinGame(game.gameId, user0);
    await startGame(game.gameId, user0);

    const info = (await getGameById(game.gameId))!;
    expect(info.status).toBe("active");
    expect(info.players.map((p) => p.isAi)).toEqual([true, undefined]);

    const stored = await GameRepo.get(game.gameId);
    expect(stored.players).toEqual([botSeat.deploymentId, user0.userId]);
    expect(stored.aiPlayers).toEqual([botSeat]);
  });

  it("rejects joining an unknown game", async () => {
    await expect(joinGameAsAi(randomUUID().toString(), botSeat)).rejects.toThrow(/invalid game/);
  });

  it("rejects joining a game that already started", async () => {
    const user1 = (await getUserByUsername("user1"))!;
    const game = await createGame(user0, "nim", new Date());
    await joinGame(game.gameId, user1);
    await startGame(game.gameId, user0);

    await expect(joinGameAsAi(game.gameId, botSeat)).rejects.toThrow(/started/);
  });

  it("rejects a deployment joining a game it is already seated in", async () => {
    await seedBotDeployment();
    const game = await createGameWithAi(botSeat, "nim", new Date());

    await expect(joinGameAsAi(game.gameId, botSeat)).rejects.toThrow(/already/);
  });

  it("rejects joining a full game", async () => {
    const user1 = (await getUserByUsername("user1"))!;
    const game = await createGame(user0, "nim", new Date());
    await joinGame(game.gameId, user1);

    await expect(joinGameAsAi(game.gameId, botSeat)).rejects.toThrow(/full/);
  });
});

describe("AI forfeit on persistent invalid moves (CoS 2.8)", () => {
  function scriptInferenceRejection(consecutiveInvalid: number, forfeit: boolean): void {
    setInferenceClientForTests({
      requestMove: vi.fn().mockRejectedValue(
        new InferenceError("Inference /inference/move failed: no legal action", 422, {
          consecutiveInvalid,
          forfeit,
        }),
      ),
    });
  }

  it("records the streak and lets the human move stand before the third strike", async () => {
    scriptInferenceRejection(1, false);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const gameId = await seedNimGame({
      players: [user0.userId, botSeat.deploymentId],
      aiPlayers: [null, botSeat],
      state: { remaining: 10, nextPlayer: 0 },
    });

    const { views, gameResult } = await updateGame(gameId, user0, 3);

    expect(gameResult).toBeUndefined();
    expect(nimView(views)).toEqual({ remaining: 7, nextPlayer: 1 });

    // First strike: the AI turn produces no move, only streak bookkeeping.
    expect(await maybeFireAiMove(gameId)).toBeNull();
    const stored = await GameRepo.get(gameId);
    expect(stored.done).toBe(false);
    expect(stored.invalidMoveStreaks).toEqual({ 1: 1 });
    expect(consoleError).toHaveBeenCalled();
  });

  it("forfeits the game to the other seat on the third strike", async () => {
    scriptInferenceRejection(3, true);
    const gameId = await seedNimGame({
      players: [user0.userId, botSeat.deploymentId],
      aiPlayers: [null, botSeat],
      state: { remaining: 10, nextPlayer: 0 },
    });

    const human = await updateGame(gameId, user0, 3);
    expect(human.gameResult).toBeUndefined();

    // The AI's own turn strikes out and decides the game.
    const outcome = await maybeFireAiMove(gameId);
    expect(outcome).not.toBeNull();
    const { views, gameResult } = outcome!;

    expect(gameResult).toEqual({
      winnerId: user0.userId,
      outcome: "forfeit",
      ratingChanges: [
        { entityId: user0.userId, delta: expect.any(Number) },
        { entityId: botSeat.modelId, delta: expect.any(Number) },
      ],
    });
    expect(gameResult!.ratingChanges![0].delta).toBeGreaterThan(0);
    expect(gameResult!.ratingChanges![1].delta).toBeLessThan(0);
    // The board shows the human's accepted move; the game is over.
    expect(nimView(views)).toEqual({ remaining: 7, nextPlayer: 1 });

    const stored = await GameRepo.get(gameId);
    expect(stored.done).toBe(true);
    expect(stored.matchId).toBe(gameId);
    expect(stored.invalidMoveStreaks).toEqual({ 1: 3 });

    // The winner's rating rose under the human key; the model's fell.
    const humanRecord = await RatingRepo.find(
      ratingKey({ entityType: "human", entityId: user0.userId, gameKey: "nim" }),
    );
    const modelRecord = await RatingRepo.find(
      ratingKey({ entityType: "ai", entityId: botSeat.modelId, gameKey: "nim" }),
    );
    expect(humanRecord!.rating).toBeGreaterThan(DEFAULT_RATING);
    expect(modelRecord!.rating).toBeLessThan(DEFAULT_RATING);

    // The archive carries the forfeit with the human's lone move.
    const match = await MatchRepo.get(gameId);
    expect(match.result.outcome).toBe("forfeit");
    expect(match.result.winnerId).toBe(user0.userId);
    expect(match.result.ratingChanges).toHaveLength(2);
    expect(match.moves).toHaveLength(1);
  });

  it("forfeits an opening-move strikeout from seat 0 with no captured moves", async () => {
    scriptInferenceRejection(3, true);
    const gameId = await seedNimGame({
      players: [botSeat.deploymentId, user0.userId],
      aiPlayers: [botSeat, null],
      state: { remaining: 21, nextPlayer: 0 },
    });

    const outcome = await maybeFireAiMove(gameId);

    expect(outcome).not.toBeNull();
    expect(outcome!.gameResult).toEqual({
      winnerId: user0.userId,
      outcome: "forfeit",
      ratingChanges: [
        { entityId: botSeat.modelId, delta: expect.any(Number) },
        { entityId: user0.userId, delta: expect.any(Number) },
      ],
    });
    expect(nimView(outcome!.views)).toEqual({ remaining: 21, nextPlayer: 0 });

    const stored = await GameRepo.get(gameId);
    expect(stored.done).toBe(true);
    expect(stored.invalidMoveStreaks).toEqual({ 0: 3 });

    const match = await MatchRepo.get(gameId);
    expect(match.result).toEqual({
      outcome: "forfeit",
      winnerId: user0.userId,
      ratingChanges: [
        { entityId: botSeat.modelId, delta: expect.any(Number) },
        { entityId: user0.userId, delta: expect.any(Number) },
      ],
    });
    expect(match.moves).toEqual([]);
  });

  it("emits a forfeit result without rating changes for unrated games", async () => {
    scriptInferenceRejection(3, true);
    const gameId = await seedNimGame({
      players: [user0.userId, botSeat.deploymentId],
      aiPlayers: [null, botSeat],
      state: { remaining: 10, nextPlayer: 0 },
      rated: false,
    });

    const human = await updateGame(gameId, user0, 3);
    expect(human.gameResult).toBeUndefined();

    const outcome = await maybeFireAiMove(gameId);

    expect(outcome?.gameResult).toEqual({ winnerId: user0.userId, outcome: "forfeit" });
    expect(
      await RatingRepo.find(
        ratingKey({ entityType: "ai", entityId: botSeat.modelId, gameKey: "nim" }),
      ),
    ).toBeNull();
    expect(
      await RatingRepo.find(
        ratingKey({ entityType: "human", entityId: user0.userId, gameKey: "nim" }),
      ),
    ).toBeNull();

    const stored = await GameRepo.get(gameId);
    expect(stored.done).toBe(true);
  });

  it("records no streak for inference failures without a counter", async () => {
    setInferenceClientForTests({
      requestMove: vi
        .fn()
        .mockRejectedValue(new InferenceError("Inference service unreachable: down", 503)),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const gameId = await seedNimGame({
      players: [user0.userId, botSeat.deploymentId],
      aiPlayers: [null, botSeat],
      state: { remaining: 10, nextPlayer: 0 },
    });

    const { gameResult } = await updateGame(gameId, user0, 3);
    expect(gameResult).toBeUndefined();

    // A 503 carries no consecutiveInvalid counter, so no invalid-move streak is
    // recorded against the AI — the outage ends the match as abandoned rather
    // than as a strike toward forfeit.
    const outcome = await maybeFireAiMove(gameId);
    expect(outcome?.gameResult).toEqual({ outcome: "abandoned" });
    const stored = await GameRepo.get(gameId);
    expect(stored.invalidMoveStreaks).toBeUndefined();
    expect(stored.done).toBe(true);
  });
});

/* ---------------------------------------------------------------------------
 * Lifecycle guards and failure tolerance around the AI changes — pinned here
 * so the whole changed file stays covered.
 * ------------------------------------------------------------------------- */

describe("game lifecycle guards", () => {
  it("getGameById reports a finished game as done", async () => {
    const gameId = randomUUID().toString();
    await GameRepo.set(gameId, {
      type: "nim",
      state: { remaining: 0, nextPlayer: 1 },
      done: true,
      chat: "chat-x",
      players: [user0.userId],
      aiPlayers: [],
      rated: false,
      createdAt: new Date().toISOString(),
      createdBy: user0.userId,
    });
    expect((await getGameById(gameId))!.status).toBe("done");
  });

  it("joinGame guards: unknown game, started game, duplicate join, full game", async () => {
    const user1 = (await getUserByUsername("user1"))!;
    const user2 = (await getUserByUsername("user2"))!;
    await expect(joinGame(randomUUID().toString(), user0)).rejects.toThrow(/invalid game/);

    const game = await createGame(user0, "nim", new Date());
    await expect(joinGame(game.gameId, user0)).rejects.toThrow(/already/);
    await joinGame(game.gameId, user1);
    await expect(joinGame(game.gameId, user2)).rejects.toThrow(/full/);

    await startGame(game.gameId, user0);
    await expect(joinGame(game.gameId, user2)).rejects.toThrow(/started/);
  });

  it("startGame guards: unknown game, started game, underpopulated, non-member", async () => {
    const user1 = (await getUserByUsername("user1"))!;
    const user2 = (await getUserByUsername("user2"))!;
    await expect(startGame(randomUUID().toString(), user0)).rejects.toThrow(/invalid game/);

    const game = await createGame(user0, "nim", new Date());
    await expect(startGame(game.gameId, user0)).rejects.toThrow(/underpopulated/);
    await joinGame(game.gameId, user1);
    await expect(startGame(game.gameId, user2)).rejects.toThrow(/not in/);
    await startGame(game.gameId, user0);
    await expect(startGame(game.gameId, user0)).rejects.toThrow(/started/);
  });

  it("updateGame guards: unknown game, unstarted game, non-player", async () => {
    const user1 = (await getUserByUsername("user1"))!;
    const user2 = (await getUserByUsername("user2"))!;
    await expect(updateGame(randomUUID().toString(), user0, 3)).rejects.toThrow(/invalid game/);

    const game = await createGame(user0, "nim", new Date());
    await expect(updateGame(game.gameId, user0, 3)).rejects.toThrow(/hadn't started/);
    await joinGame(game.gameId, user1);
    await startGame(game.gameId, user0);
    await expect(updateGame(game.gameId, user2, 3)).rejects.toThrow(/weren't playing/);
  });

  it("viewGame guards and views for members, outsiders, and unstarted games", async () => {
    const user1 = (await getUserByUsername("user1"))!;
    const user2 = (await getUserByUsername("user2"))!;
    await expect(viewGame(randomUUID().toString(), user0)).rejects.toThrow(/invalid game/);

    const game = await createGame(user0, "nim", new Date());
    // Unstarted: no view yet, regardless of membership.
    expect(await viewGame(game.gameId, user0)).toMatchObject({ isPlayer: true, view: null });

    await joinGame(game.gameId, user1);
    await startGame(game.gameId, user0);
    const member = await viewGame(game.gameId, user0);
    expect(member.isPlayer).toBe(true);
    expect(member.view).not.toBeNull();
    const outsider = await viewGame(game.gameId, user2);
    expect(outsider.isPlayer).toBe(false);
  });
});

describe("AI loop edge cases", () => {
  it("returns null for a record without an aiPlayers list", async () => {
    const gameId = randomUUID().toString();
    const legacyRecord = {
      type: "nim",
      state: { remaining: 21, nextPlayer: 0 },
      done: false,
      chat: "chat-x",
      players: [user0.userId],
      rated: false,
      createdAt: new Date().toISOString(),
      createdBy: user0.userId,
    } as GameRecord; // legacy pre-migration shape: aiPlayers absent
    await GameRepo.set(gameId, legacyRecord);
    expect(await maybeFireAiMove(gameId)).toBeNull();
  });

  it("logs and stands down on a non-inference error from the client", async () => {
    setInferenceClientForTests({ requestMove: vi.fn().mockRejectedValue(new Error("boom")) });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const gameId = await seedNimGame({
      players: [botSeat.deploymentId, user0.userId],
      aiPlayers: [botSeat, null],
      state: { remaining: 21, nextPlayer: 0 },
    });

    expect(await maybeFireAiMove(gameId)).toBeNull();
    expect(consoleError).toHaveBeenCalled();
    const stored = await GameRepo.get(gameId);
    expect(stored.invalidMoveStreaks).toBeUndefined();
  });

  it("falls back to the deployment id when the seat has no players entry", async () => {
    scriptAiMoves(3);
    const gameId = await seedNimGame({
      players: [user0.userId], // seat 1 missing from players entirely
      aiPlayers: [null, botSeat],
      state: { remaining: 21, nextPlayer: 1 },
    });

    // The fallback identity isn't seated, so updateGame rejects the move —
    // the defensive ?? keeps the failure loud instead of a TypeError.
    await expect(maybeFireAiMove(gameId)).rejects.toThrow(/weren't playing/);
  });

  it("encodes the guess observation window for a non-nim game with a turn marker", async () => {
    const requestMove = vi.fn().mockResolvedValue({ move: 50 });
    setInferenceClientForTests({ requestMove });
    const gameId = randomUUID().toString();
    await GameRepo.set(gameId, {
      type: "guess",
      state: { secret: 42, guesses: [null, null], nextPlayer: 1 },
      done: false,
      chat: "chat-x",
      players: [user0.userId, botSeat.deploymentId],
      aiPlayers: [null, botSeat],
      rated: false,
      createdAt: new Date().toISOString(),
      createdBy: user0.userId,
    });

    const outcome = await maybeFireAiMove(gameId);

    expect(requestMove).toHaveBeenCalledExactlyOnceWith({
      deploymentId: botSeat.deploymentId,
      state: { low: 1, high: 100 },
    });
    expect(outcome).not.toBeNull();
    expect(outcome!.views.watchers.type).toBe("guess");
  });

  it("encodes the tictactoe board player-relative for inference", async () => {
    // AI is seat 1 (X, nextPlayer=1); empty board → all zeros
    const requestMove = vi.fn().mockResolvedValue({ move: [0, 0] });
    setInferenceClientForTests({ requestMove });
    const gameId = randomUUID().toString();
    await GameRepo.set(gameId, {
      type: "tictactoe",
      state: {
        board: [
          [".", ".", "."],
          [".", ".", "."],
          [".", ".", "."],
        ],
        nextPlayer: 1,
      },
      done: false,
      chat: "chat-ttt",
      players: [user0.userId, botSeat.deploymentId],
      aiPlayers: [null, botSeat],
      rated: false,
      createdAt: new Date().toISOString(),
      createdBy: user0.userId,
    });

    await maybeFireAiMove(gameId);

    expect(requestMove).toHaveBeenCalledExactlyOnceWith({
      deploymentId: botSeat.deploymentId,
      state: { board: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
    });
  });

  it("encodes the connect4 board player-relative for inference", async () => {
    // AI is seat 1 (Y, nextPlayer=1); empty board → all-zero rows
    const emptyRow = [".", ".", ".", ".", ".", ".", "."];
    const requestMove = vi.fn().mockResolvedValue({ move: 0 });
    setInferenceClientForTests({ requestMove });
    const gameId = randomUUID().toString();
    await GameRepo.set(gameId, {
      type: "connect4",
      state: {
        board: Array.from({ length: 6 }, () => [...emptyRow]),
        nextPlayer: 1,
      },
      done: false,
      chat: "chat-c4",
      players: [user0.userId, botSeat.deploymentId],
      aiPlayers: [null, botSeat],
      rated: false,
      createdAt: new Date().toISOString(),
      createdBy: user0.userId,
    });

    await maybeFireAiMove(gameId);

    const call = requestMove.mock.calls[0][0] as { state: { board: number[][] } };
    expect(call.state.board).toHaveLength(6);
    expect(call.state.board[0]).toHaveLength(7);
    expect(call.state.board[0].every((v: number) => v === 0)).toBe(true);
  });

  it("encodes checkers as 32 dark-square entries and passes legalMoves", async () => {
    // AI is seat 1 (B, nextPlayer=1); B piece at [2,1], can step to [3,2]
    const emptyRow = [".", ".", ".", ".", ".", ".", ".", "."];
    const board = Array.from({ length: 8 }, () => [...emptyRow]);
    board[2][1] = "B";
    const requestMove = vi.fn().mockResolvedValue({
      move: {
        squares: [
          [2, 1],
          [3, 2],
        ],
      },
    });
    setInferenceClientForTests({ requestMove });
    const gameId = randomUUID().toString();
    await GameRepo.set(gameId, {
      type: "checkers",
      state: { board, nextPlayer: 1 },
      done: false,
      chat: "chat-chk",
      players: [user0.userId, botSeat.deploymentId],
      aiPlayers: [null, botSeat],
      rated: false,
      createdAt: new Date().toISOString(),
      createdBy: user0.userId,
    });

    await maybeFireAiMove(gameId);

    const call = requestMove.mock.calls[0][0] as {
      state: { squares: string[] };
      legalMoves: unknown[];
    };
    expect(call.state.squares).toHaveLength(32);
    expect(call.legalMoves).toBeDefined();
    expect(call.legalMoves.length).toBeGreaterThan(0);
  });
});

describe("failure tolerance around archival", () => {
  it("keeps the accepted move when captureMove fails", async () => {
    const user1 = (await getUserByUsername("user1"))!;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(matchRecorder, "captureMove").mockRejectedValueOnce(new Error("archive down"));
    const game = await createGame(user0, "nim", new Date());
    await joinGame(game.gameId, user1);
    await startGame(game.gameId, user0);

    const { views } = await updateGame(game.gameId, user0, 3);

    expect(nimView(views)).toEqual({ remaining: 18, nextPlayer: 1 });
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("match capture failed"),
      expect.any(Error),
    );
  });

  it("still forfeits when the forfeit archive write fails", async () => {
    setInferenceClientForTests({
      requestMove: vi
        .fn()
        .mockRejectedValue(
          new InferenceError("no legal action", 422, { consecutiveInvalid: 3, forfeit: true }),
        ),
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(matchRecorder, "finalizeAsForfeit").mockRejectedValueOnce(new Error("archive down"));
    const gameId = await seedNimGame({
      players: [user0.userId, botSeat.deploymentId],
      aiPlayers: [null, botSeat],
      state: { remaining: 10, nextPlayer: 0 },
      rated: false,
    });

    const human = await updateGame(gameId, user0, 3);
    expect(human.gameResult).toBeUndefined();

    const outcome = await maybeFireAiMove(gameId);

    expect(outcome?.gameResult).toEqual({ winnerId: user0.userId, outcome: "forfeit" });
    expect((await GameRepo.get(gameId)).done).toBe(true);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("match capture failed"),
      expect.any(Error),
    );
  });
});

describe("maybeFireAiMove — unknown game type", () => {
  it("calls encodeStateForInference and rejects when game type is not recognised", async () => {
    const gameId = randomUUID();
    await GameRepo.set(gameId, {
      type: "unknown_game",
      state: { nextPlayer: 0 },
      done: false,
      chat: "c1",
      players: [botSeat.deploymentId],
      aiPlayers: [botSeat, null],
      rated: false,
      createdAt: new Date().toISOString(),
      createdBy: "u1",
    } as unknown as GameRecord);
    scriptAiMoves(1);
    await expect(maybeFireAiMove(gameId)).rejects.toThrow();
  });
});

describe("forfeitGame (player resigns)", () => {
  it("ends the game as a forfeit — the resigning player loses, the other wins", async () => {
    const user1 = (await getUserByUsername("user1"))!;
    const gameId = await seedNimGame({
      players: [user0.userId, user1.userId],
      aiPlayers: [null, null],
      state: { remaining: 12, nextPlayer: 0 },
      rated: false,
    });

    const { gameResult } = await forfeitGame(gameId, user0);

    expect(gameResult).toEqual({ outcome: "forfeit", winnerId: user1.userId });
    const stored = await GameRepo.get(gameId);
    expect(stored.done).toBe(true);
    // Archived as a forfeit win for the other seat.
    const match = await MatchRepo.get(gameId);
    expect(match.result).toEqual({ outcome: "forfeit", winnerId: user1.userId });
  });

  it("lets a human resign while the AI is driving (it is the AI's turn)", async () => {
    // nextPlayer = 1 is the AI seat — the human (seat 0) is waiting on the
    // model, and must still be able to leave.
    const gameId = await seedNimGame({
      players: [user0.userId, botSeat.deploymentId],
      aiPlayers: [null, botSeat],
      state: { remaining: 7, nextPlayer: 1 },
      rated: false,
    });

    const { gameResult } = await forfeitGame(gameId, user0);

    expect(gameResult!.outcome).toBe("forfeit");
    expect(gameResult!.winnerId).toBe(botSeat.deploymentId);
    expect((await GameRepo.get(gameId)).done).toBe(true);
  });

  it("rejects a forfeit from someone who isn't a player in the game", async () => {
    const user1 = (await getUserByUsername("user1"))!;
    const stranger = (await getUserByUsername("user2"))!;
    const gameId = await seedNimGame({
      players: [user0.userId, user1.userId],
      aiPlayers: [null, null],
      state: { remaining: 12, nextPlayer: 0 },
      rated: false,
    });

    await expect(forfeitGame(gameId, stranger)).rejects.toThrow(/weren't playing/);
    expect((await GameRepo.get(gameId)).done).toBe(false);
  });

  it("rejects a forfeit on a game that is already over", async () => {
    const user1 = (await getUserByUsername("user1"))!;
    const gameId = await seedNimGame({
      players: [user0.userId, user1.userId],
      aiPlayers: [null, null],
      state: { remaining: 12, nextPlayer: 0 },
      rated: false,
    });
    await forfeitGame(gameId, user0);

    await expect(forfeitGame(gameId, user1)).rejects.toThrow(/already over/);
  });

  it("rejects a forfeit on a missing game", async () => {
    await expect(forfeitGame("no-such-game", user0)).rejects.toThrow(/invalid game/);
  });

  it("stops the game — no further moves land after a forfeit", async () => {
    const user1 = (await getUserByUsername("user1"))!;
    const gameId = await seedNimGame({
      players: [user0.userId, user1.userId],
      aiPlayers: [null, null],
      state: { remaining: 12, nextPlayer: 0 },
      rated: false,
    });
    await forfeitGame(gameId, user0);

    // Neither seat can keep playing a game that is already decided.
    await expect(updateGame(gameId, user0, 1)).rejects.toThrow(/already over/);
    await expect(updateGame(gameId, user1, 1)).rejects.toThrow(/already over/);
    // The position is untouched by the rejected moves.
    expect((await GameRepo.get(gameId)).state).toEqual({ remaining: 12, nextPlayer: 0 });
  });

  it("lets the OWNER of a deployed AI forfeit the game it is playing for them", async () => {
    // The user's model holds the seat (game.players carries the DEPLOYMENT id,
    // never the owner's userId) — the owner watches but must still be able to
    // pull the plug. Ownership is resolved through the deployment record.
    const user1 = (await getUserByUsername("user1"))!;
    const myBot: AIParticipant = { deploymentId: "dep-mine", modelId: "m1", displayName: "MyBot" };
    await DeploymentRepo.set("dep-mine", {
      modelId: "m1",
      userId: user0.userId,
      gameKey: "nim",
      displayName: "MyBot",
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const gameId = await seedNimGame({
      players: [myBot.deploymentId, user1.userId], // seat 0 = my AI, seat 1 = human opponent
      aiPlayers: [myBot, null],
      state: { remaining: 9, nextPlayer: 0 },
      rated: false,
    });

    // user0 owns the AI in seat 0 but is NOT listed in game.players.
    const { gameResult } = await forfeitGame(gameId, user0);

    expect(gameResult).toEqual({ outcome: "forfeit", winnerId: user1.userId });
    expect((await GameRepo.get(gameId)).done).toBe(true);
  });

  it("rejects a forfeit from someone who neither plays nor owns a seated AI", async () => {
    const user1 = (await getUserByUsername("user1"))!;
    const stranger = (await getUserByUsername("user2"))!;
    const myBot: AIParticipant = {
      deploymentId: "dep-mine2",
      modelId: "m2",
      displayName: "MyBot2",
    };
    await DeploymentRepo.set("dep-mine2", {
      modelId: "m2",
      userId: user0.userId, // owned by user0, NOT the stranger
      gameKey: "nim",
      displayName: "MyBot2",
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const gameId = await seedNimGame({
      players: [myBot.deploymentId, user1.userId],
      aiPlayers: [myBot, null],
      state: { remaining: 9, nextPlayer: 0 },
      rated: false,
    });

    await expect(forfeitGame(gameId, stranger)).rejects.toThrow(/weren't playing/);
    expect((await GameRepo.get(gameId)).done).toBe(false);
  });
});
