import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { AIParticipant, GameRecord } from "../../src/models.ts";
import { GameRepo } from "../../src/repository.ts";
import { getUserByUsername } from "../../src/services/auth.service.ts";
import { maybeFireAiMove, updateGame } from "../../src/services/game.service.ts";
import { updateRatingsForGame } from "../../src/services/rating.service.ts";
import {
  InferenceError,
  resetInferenceClientForTests,
  setInferenceClientForTests,
} from "../../src/services/inferenceClient.ts";
import type { UserWithId } from "../../src/types.ts";

/* ---------------------------------------------------------------------------
 * Rating-pipeline failure tolerance: a rating write that fails (or returns
 * nothing) must never lose an accepted move or a forfeit decision. The
 * rating module is mocked here — game.service.spec.ts exercises the real
 * pipeline.
 * ------------------------------------------------------------------------- */

vi.mock(import("../../src/services/rating.service.ts"), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, updateRatingsForGame: vi.fn() };
});

const botSeat: AIParticipant = {
  deploymentId: "dep-fail",
  modelId: "model-fail",
  displayName: "FailBot",
};

let user0: UserWithId;

async function seedNimGame(state: { remaining: number; nextPlayer: number }): Promise<string> {
  const gameId = randomUUID().toString();
  const game: GameRecord = {
    type: "nim",
    state,
    done: false,
    chat: "chat-fail",
    players: [user0.userId, botSeat.deploymentId],
    aiPlayers: [null, botSeat],
    rated: true,
    createdAt: new Date().toISOString(),
    createdBy: user0.userId,
  };
  await GameRepo.set(gameId, game);
  return gameId;
}

function scriptForfeit(): void {
  setInferenceClientForTests({
    requestMove: vi
      .fn()
      .mockRejectedValue(
        new InferenceError("no legal action", 422, { consecutiveInvalid: 3, forfeit: true }),
      ),
  });
}

beforeEach(async () => {
  user0 = (await getUserByUsername("user0"))!;
  vi.mocked(updateRatingsForGame).mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  resetInferenceClientForTests();
  vi.restoreAllMocks();
});

describe("rating failures", () => {
  it("finishes a rated game without a result when the rating update throws", async () => {
    vi.mocked(updateRatingsForGame).mockRejectedValue(new Error("glicko offline"));
    setInferenceClientForTests({ requestMove: vi.fn().mockResolvedValue({ move: 1 }) });
    const gameId = await seedNimGame({ remaining: 4, nextPlayer: 0 });

    // Human takes 3; the AI's own turn takes the last object and ends the game.
    const human = await updateGame(gameId, user0, 3);
    expect(human.gameResult).toBeUndefined();
    expect((await GameRepo.get(gameId)).done).toBe(false);

    const outcome = await maybeFireAiMove(gameId);

    expect(outcome).not.toBeNull();
    expect(outcome!.gameResult).toBeUndefined();
    expect((await GameRepo.get(gameId)).done).toBe(true);
    // eslint-disable-next-line no-console
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("rating update failed"),
      expect.any(Error),
    );
  });

  it("falls back to a bare forfeit result when the rating update throws", async () => {
    vi.mocked(updateRatingsForGame).mockRejectedValue(new Error("glicko offline"));
    scriptForfeit();
    const gameId = await seedNimGame({ remaining: 10, nextPlayer: 0 });

    const human = await updateGame(gameId, user0, 3);
    expect(human.gameResult).toBeUndefined();

    // The AI's turn strikes out (scripted 422 + forfeit) and decides the game.
    const outcome = await maybeFireAiMove(gameId);

    expect(outcome?.gameResult).toEqual({ winnerId: user0.userId, outcome: "forfeit" });
    expect((await GameRepo.get(gameId)).done).toBe(true);
  });

  it("falls back to a bare forfeit result when the rating update declines", async () => {
    // updateRatingsForGame returns undefined for games it can't rate.
    vi.mocked(updateRatingsForGame).mockResolvedValue(undefined);
    scriptForfeit();
    const gameId = await seedNimGame({ remaining: 10, nextPlayer: 0 });

    const human = await updateGame(gameId, user0, 3);
    expect(human.gameResult).toBeUndefined();

    const outcome = await maybeFireAiMove(gameId);

    expect(outcome?.gameResult).toEqual({ winnerId: user0.userId, outcome: "forfeit" });
    expect(vi.mocked(updateRatingsForGame)).toHaveBeenCalledWith(expect.anything(), gameId, {
      winnerId: user0.userId,
      outcome: "forfeit",
    });
  });
});
