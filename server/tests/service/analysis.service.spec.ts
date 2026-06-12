import { afterEach, describe, expect, it, vi } from "vitest";
import type { MatchRecord } from "../../src/models.ts";
import { DeploymentRepo, MatchRepo } from "../../src/repository.ts";
import { analyzeReplay } from "../../src/services/analysis.service.ts";
import {
  mockInferenceClient,
  resetInferenceClient,
  setInferenceClient,
} from "../../src/services/inferenceClient.ts";

const P1 = { id: "u-p1", type: "human" as const, displayName: "Player One" };
const P2 = { id: "u-p2", type: "human" as const, displayName: "Player Two" };

function nimMatch(moves: number[]): MatchRecord {
  return {
    gameId: "game-nim-1",
    gameKey: "nim",
    rated: true,
    participants: [P1, P2],
    moves: moves.map((move, i) => ({
      actor: i % 2 === 0 ? P1.id : P2.id,
      move,
      timestamp: `2026-06-09T00:0${i}:00.000Z`,
    })),
    result: { outcome: "win", winnerId: P1.id },
    initialState: { remaining: 21, nextPlayer: 0 },
    createdAt: "2026-06-09T00:10:00.000Z",
    completedAt: "2026-06-09T00:10:00.000Z",
  };
}

function guessMatch(moves: number[], secret?: number): MatchRecord {
  return {
    gameId: "game-guess-1",
    gameKey: "guess",
    rated: false,
    participants: [P1, P2],
    moves: moves.map((move, i) => ({
      actor: i % 2 === 0 ? P1.id : P2.id,
      move,
      timestamp: `2026-06-09T01:0${i}:00.000Z`,
    })),
    result: { outcome: "win", winnerId: P1.id },
    initialState: secret === undefined ? undefined : { secret, guesses: [] },
    createdAt: "2026-06-09T01:10:00.000Z",
    completedAt: "2026-06-09T01:10:00.000Z",
  };
}

describe("analyzeReplay", () => {
  it("returns null for an unknown match", async () => {
    expect(await analyzeReplay("nope")).toBeNull();
  });

  it("nim: flags an already-lost position, a blunder, and the best move", async () => {
    // 21 % 4 === 1, so move 0 is already a forced loss no matter what's taken.
    // After taking 3 (remaining 18), the winning take is 1 - taking 3 again is
    // a blunder. After that (remaining 15), the winning take is 2.
    await MatchRepo.set("m-nim", nimMatch([3, 3, 2]));

    const result = await analyzeReplay("m-nim");

    expect(result!.matchId).toBe("m-nim");
    expect(result!.perMove[0].flag).toBe("neutral");
    expect(result!.perMove[1]).toMatchObject({ flag: "blunder", suggestedMove: 1 });
    expect(result!.perMove[2]).toMatchObject({ flag: "best" });
  });

  it("guess: ranks guesses by distance from the secret", async () => {
    // secret is 50: 45 is close (neutral), 90 is the farthest (inaccuracy),
    // 50 is exact (best).
    await MatchRepo.set("m-guess", guessMatch([45, 90, 50], 50));

    const result = await analyzeReplay("m-guess");

    expect(result!.perMove[0].flag).toBe("neutral");
    expect(result!.perMove[1]).toMatchObject({ flag: "inaccuracy", suggestedMove: 50 });
    expect(result!.perMove[2].flag).toBe("best");
    expect(result!.perMove[2].suggestedMove).toBeUndefined();
  });

  it("guess: every guess equally far from the secret is neutral", async () => {
    await MatchRepo.set("m-guess-tied", guessMatch([40, 60], 50));

    const result = await analyzeReplay("m-guess-tied");

    expect(result!.perMove.map((m) => m.flag)).toStrictEqual(["neutral", "neutral"]);
  });

  it("guess: falls back to zero-confidence neutral when no secret was recorded", async () => {
    await MatchRepo.set("m-guess-no-secret", guessMatch([10, 20], undefined));

    const result = await analyzeReplay("m-guess-no-secret");

    expect(result!.perMove).toStrictEqual([
      { moveIndex: 0, flag: "neutral", confidence: 0 },
      { moveIndex: 1, flag: "neutral", confidence: 0 },
    ]);
  });

  it("omits engineMove when no deploymentId is given", async () => {
    await MatchRepo.set("m-nim-no-deployment", nimMatch([3]));

    const result = await analyzeReplay("m-nim-no-deployment");

    expect(result!.perMove[0].engineMove).toBeUndefined();
  });

  describe("with a deploymentId", () => {
    afterEach(() => {
      resetInferenceClient();
    });

    it("nim: attaches the loaded model's move as engineMove", async () => {
      setInferenceClient(mockInferenceClient);
      await MatchRepo.set("m-nim-engine", nimMatch([3]));

      const result = await analyzeReplay("m-nim-engine", "dep-1");

      expect(result!.perMove[0].engineMove).toBe(1);
    });

    it("guess: attaches the loaded model's move as engineMove", async () => {
      setInferenceClient(mockInferenceClient);
      await MatchRepo.set("m-guess-engine", guessMatch([45], 50));

      const result = await analyzeReplay("m-guess-engine", "dep-1");

      expect(result!.perMove[0].engineMove).toBe(1);
    });

    it("falls back to no engineMove when the inference call fails", async () => {
      setInferenceClient({
        ...mockInferenceClient,
        requestMove: () => Promise.reject(new Error("inference down")),
      });
      await MatchRepo.set("m-nim-engine-down", nimMatch([3]));

      const result = await analyzeReplay("m-nim-engine-down", "dep-1");

      expect(result!.perMove[0].engineMove).toBeUndefined();
    });

    it("loads the deployed model into inference before requesting moves", async () => {
      await DeploymentRepo.set("dep-loaded", {
        modelId: "model-1",
        userId: "u-owner",
        gameKey: "nim",
        displayName: "Test Model",
        status: "active",
        createdAt: "2026-06-09T00:00:00.000Z",
        updatedAt: "2026-06-09T00:00:00.000Z",
      });
      const loadModel = vi.fn().mockResolvedValue({ status: "loaded" });
      setInferenceClient({ ...mockInferenceClient, loadModel });
      await MatchRepo.set("m-nim-load", nimMatch([3]));

      await analyzeReplay("m-nim-load", "dep-loaded");

      expect(loadModel).toHaveBeenCalledWith({
        deploymentId: "dep-loaded",
        game: "nim",
        modelId: "model-1",
      });
    });
  });
});
