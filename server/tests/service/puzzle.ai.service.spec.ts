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

async function seedConnect4Puzzle(): Promise<void> {
  // An empty board: the raw watcher view stores "."/"R"/"Y" cells, but the
  // inference encoder needs player-relative ints — exercising the encode step.
  const board = Array.from({ length: 6 }, () => [".", ".", ".", ".", ".", ".", "."]);
  await PuzzleRepo.set(`connect4:${DATE}`, {
    gameKey: "connect4",
    date: DATE,
    position: { board, nextPlayer: 0 },
    solution: { moves: [3], explanation: "seeded by test" },
    createdAt: NOW.toISOString(),
  });
}

async function seedCheckersPuzzle(withLegalMoves: boolean): Promise<void> {
  const board = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => "."));
  board[3][4] = "B";
  board[4][5] = "R";
  board[6][1] = "RK";
  const position: Record<string, unknown> = { board, nextPlayer: 0, winner: null };
  // When the watcher view carries a legal-move list the AI path forwards it;
  // omitting it exercises the `?? []` fallback.
  if (withLegalMoves) {
    position["legalMoves"] = [
      {
        squares: [
          [4, 5],
          [2, 3],
        ],
      },
    ];
  }
  await PuzzleRepo.set(`checkers:${DATE}`, {
    gameKey: "checkers",
    date: DATE,
    position,
    solution: {
      moves: [
        {
          squares: [
            [4, 5],
            [2, 3],
          ],
        },
      ],
      explanation: "seeded by test",
    },
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
  it("encodes a board game's position for inference (not the raw watcher view)", async () => {
    await seedConnect4Puzzle();
    const deploymentId = await seedNimDeployment(user, "connect4");
    mockedRequestMove.mockResolvedValue({ move: 3 });

    const result = await submitAiAttempt(user, "connect4", deploymentId, DATE, NOW);

    expect(result).not.toBeNull();
    // The model must receive the ENCODED board (player-relative ints), not the
    // raw "R"/"Y"/"." watcher view the Python encoder can't read — that
    // mismatch was the 400 when deploying a connect4 model on the daily puzzle.
    expect(mockedRequestMove).toHaveBeenCalledWith(
      expect.objectContaining({
        deploymentId,
        state: { board: Array.from({ length: 6 }, () => [0, 0, 0, 0, 0, 0, 0]) },
      }),
    );
  });

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
      // nim encodes to just { remaining } (the per-game inference encoding),
      // not the raw watcher view.
      expect.objectContaining({ deploymentId, state: { remaining: 6 } }),
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

  it("checkers: forwards the position's legal-move list to inference", async () => {
    await seedCheckersPuzzle(true);
    const deploymentId = await seedNimDeployment(user, "checkers");
    mockedRequestMove.mockResolvedValue({
      move: {
        squares: [
          [4, 5],
          [2, 3],
        ],
      },
    });

    const result = await submitAiAttempt(user, "checkers", deploymentId, DATE, NOW);

    expect(result).not.toBeNull();
    expect(mockedRequestMove).toHaveBeenCalledWith(
      expect.objectContaining({
        deploymentId,
        legalMoves: [
          {
            squares: [
              [4, 5],
              [2, 3],
            ],
          },
        ],
      }),
    );
  });

  it("checkers: defaults legalMoves to [] when the position carries none", async () => {
    await seedCheckersPuzzle(false);
    const deploymentId = await seedNimDeployment(user, "checkers");
    mockedRequestMove.mockResolvedValue({
      move: {
        squares: [
          [4, 5],
          [2, 3],
        ],
      },
    });

    await submitAiAttempt(user, "checkers", deploymentId, DATE, NOW);

    expect(mockedRequestMove).toHaveBeenCalledWith(
      expect.objectContaining({ deploymentId, legalMoves: [] }),
    );
  });

  it("throws when the model returns no move", async () => {
    await seedNimPuzzle();
    const deploymentId = await seedNimDeployment(user);
    mockedRequestMove.mockResolvedValue({ move: undefined });

    await expect(submitAiAttempt(user, "nim", deploymentId, DATE, NOW)).rejects.toThrow(
      /did not return a move/,
    );
  });

  it("throws when inference returns an empty response", async () => {
    await seedNimPuzzle();
    const deploymentId = await seedNimDeployment(user);
    mockedRequestMove.mockResolvedValue(undefined);

    await expect(submitAiAttempt(user, "nim", deploymentId, DATE, NOW)).rejects.toThrow(
      /did not return a move/,
    );
  });
});
