import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameKey } from "@gamenite/shared";
import { DeploymentRepo, PuzzleRepo, UserRepo } from "../../src/repository.ts";
import { getUserByUsername } from "../../src/services/auth.service.ts";
import { submitAiAttempt } from "../../src/services/puzzle.service.ts";
import * as inferenceClient from "../../src/services/inferenceClient.ts";
import type { UserWithId } from "../../src/types.ts";

// The model's move comes from the inference service — stub it so the suite
// runs without a live inference process.
vi.mock("../../src/services/inferenceClient.ts", () => ({
  loadModel: vi.fn().mockResolvedValue({ status: "loaded" }),
  requestMove: vi.fn(),
}));
const mockedRequestMove = vi.mocked(inferenceClient.requestMove);

// A fixed puzzle-day + matching "now" so isAttemptableDate is deterministic.
const DATE = "2026-06-15";
const NOW = new Date("2026-06-15T12:00:00.000Z");

let user: UserWithId;
let other: UserWithId;

async function seedNimDeployment(owner: UserWithId, gameKey: GameKey = "nim"): Promise<string> {
  return DeploymentRepo.add({
    modelId: `model-${owner.username}-${gameKey}`,
    userId: owner.userId,
    gameKey,
    displayName: "Nim Bot",
    status: "active",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  });
}

async function seedNimPuzzle(): Promise<void> {
  // remaining 6, take 1 -> 5 (≡ 1 mod 4): the winning move.
  await PuzzleRepo.set(`nim:${DATE}`, {
    gameKey: "nim",
    date: DATE,
    position: { remaining: 6, nextPlayer: 1 },
    solution: { moves: [1], explanation: "seeded by test" },
    createdAt: NOW.toISOString(),
  });
}

beforeEach(async () => {
  await DeploymentRepo.clear();
  await PuzzleRepo.clear();
  vi.clearAllMocks();
  user = (await getUserByUsername("user0"))!;
  other = (await getUserByUsername("user1"))!;
});

describe("submitAiAttempt", () => {
  it("grades the model's winning move as a solve and rates it toward the user's Elo", async () => {
    await seedNimPuzzle();
    const deploymentId = await seedNimDeployment(user);
    mockedRequestMove.mockResolvedValue({ move: 1 }); // the winning take

    const result = await submitAiAttempt(user, "nim", deploymentId, DATE, NOW);

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(result!.rated).toBe(true);
    expect(result!.eloDelta).toBeGreaterThan(0);

    // The USER's per-game puzzle rating moved (the AI played for them).
    const record = await UserRepo.get(user.userId);
    expect(record.puzzleRatings.nim?.rating).toBe(result!.newRating.rating);
    expect(record.puzzleLastRatedAt?.nim).toBe(DATE);

    // The model was driven through inference with the puzzle's position.
    expect(mockedRequestMove).toHaveBeenCalledWith(
      expect.objectContaining({ deploymentId, state: { remaining: 6, nextPlayer: 1 } }),
    );
  });

  it("grades a losing model move as a failed rated attempt", async () => {
    await seedNimPuzzle();
    const deploymentId = await seedNimDeployment(user);
    mockedRequestMove.mockResolvedValue({ move: 3 }); // 6 - 3 = 3 (not ≡ 1 mod 4)

    const result = await submitAiAttempt(user, "nim", deploymentId, DATE, NOW);

    expect(result!.success).toBe(false);
    expect(result!.rated).toBe(true);
    expect(result!.eloDelta).toBeLessThan(0);
  });

  it("returns null when there is no puzzle for the date", async () => {
    const deploymentId = await seedNimDeployment(user);
    mockedRequestMove.mockResolvedValue({ move: 1 });
    expect(await submitAiAttempt(user, "nim", deploymentId, DATE, NOW)).toBeNull();
  });

  it("throws when the deployment isn't owned by the caller", async () => {
    await seedNimPuzzle();
    const theirs = await seedNimDeployment(other);
    await expect(submitAiAttempt(user, "nim", theirs, DATE, NOW)).rejects.toThrow();
  });

  it("throws when the deployment's game doesn't match the puzzle", async () => {
    await seedNimPuzzle();
    const c4 = await seedNimDeployment(user, "connect4");
    await expect(submitAiAttempt(user, "nim", c4, DATE, NOW)).rejects.toThrow();
  });
});
