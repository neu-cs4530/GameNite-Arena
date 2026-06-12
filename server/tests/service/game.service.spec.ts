import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { NimView } from "@gamenite/shared";
import { ratingKey, type AIParticipant, type GameRecord } from "../../src/models.ts";
import { GameRepo, MatchRepo, RatingRepo } from "../../src/repository.ts";
import { getUserByUsername } from "../../src/services/auth.service.ts";
import { maybeFireAiMove, updateGame } from "../../src/services/game.service.ts";
import {
  InferenceError,
  resetInferenceClientForTests,
  setInferenceClientForTests,
} from "../../src/services/inferenceClient.ts";
import { DEFAULT_RATING } from "../../src/services/glicko2.service.ts";
import type { UserWithId } from "../../src/types.ts";

/* ---------------------------------------------------------------------------
 * The AI move loop (CoS 2.6): a deployed model seated in a game moves
 * automatically on its turn, and a game-ending AI move surfaces its
 * MatchResult from the OUTER updateGame call so the controller can emit
 * gameResult. Inference responses are scripted through the client seam —
 * the python service never runs here.
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
  it("fires the AI reply after a human move and returns the post-AI views", async () => {
    const requestMove = scriptAiMoves(2);
    const gameId = await seedNimGame({
      players: [user0.userId, botSeat.deploymentId],
      aiPlayers: [null, botSeat],
      state: { remaining: 21, nextPlayer: 0 },
    });

    const { views, gameResult } = await updateGame(gameId, user0, 3);

    expect(gameResult).toBeUndefined();
    expect(nimView(views)).toEqual({ remaining: 16, nextPlayer: 0 });
    expect(requestMove).toHaveBeenCalledExactlyOnceWith({
      deploymentId: botSeat.deploymentId,
      state: { remaining: 18 },
    });

    const stored = await GameRepo.get(gameId);
    expect(stored.state).toEqual({ remaining: 16, nextPlayer: 0 });
    expect(stored.done).toBe(false);
  });

  it("propagates the MatchResult when the AI's move ends a rated game", async () => {
    scriptAiMoves(1);
    const gameId = await seedNimGame({
      players: [user0.userId, botSeat.deploymentId],
      aiPlayers: [null, botSeat],
      state: { remaining: 4, nextPlayer: 0 },
    });

    // Human takes 3, leaving 1; the AI must take the last object and lose
    // (misère nim) — its move ends the game.
    const { views, gameResult } = await updateGame(gameId, user0, 3);

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
    const first = await updateGame(gameId, user0, 3);
    expect(first.gameResult).toBeUndefined();
    const second = await updateGame(gameId, user0, 3);
    expect(second.gameResult).toBeUndefined();
    const third = await updateGame(gameId, user0, 3);
    expect(third.gameResult).toBeUndefined();
    const last = await updateGame(gameId, user0, 3);

    // The AI took the last object, so the human wins (misère nim).
    expect(last.gameResult).toBeDefined();
    expect(last.gameResult!.winnerId).toBe(user0.userId);
    expect(last.gameResult!.outcome).toBe("win");

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

  it("keeps the human move when inference is unreachable", async () => {
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
    const stored = await GameRepo.get(gameId);
    expect(stored.state).toEqual({ remaining: 18, nextPlayer: 1 });
    expect(consoleError).toHaveBeenCalled();
  });

  it("keeps the human move when the AI's move is illegal for the game", async () => {
    scriptAiMoves(15); // larger than remaining: nim rejects it
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const gameId = await seedNimGame({
      players: [user0.userId, botSeat.deploymentId],
      aiPlayers: [null, botSeat],
      state: { remaining: 10, nextPlayer: 0 },
    });

    const { views, gameResult } = await updateGame(gameId, user0, 3);

    expect(gameResult).toBeUndefined();
    expect(nimView(views)).toEqual({ remaining: 7, nextPlayer: 1 });
    expect(consoleError).toHaveBeenCalled();
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

    const outcome = await maybeFireAiMove(gameId);

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
