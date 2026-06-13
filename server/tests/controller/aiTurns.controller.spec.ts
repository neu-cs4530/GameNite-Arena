import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  runAiTurns,
  setAiMoveDelayForTests,
  resetAiMoveDelayForTests,
} from "../../src/controllers/game.controller.ts";
import {
  setInferenceClientForTests,
  resetInferenceClientForTests,
} from "../../src/services/inferenceClient.ts";
import { DeploymentRepo, GameRepo, ModelRepo } from "../../src/repository.ts";
import type { GameServer } from "../../src/types.ts";
import { getUserByUsername } from "../../src/services/auth.service.ts";
import { createGameWithAi, joinGame, startGame } from "../../src/services/game.service.ts";
import type { AIParticipant } from "../../src/models.ts";

async function seedAiSeat(displayName: string): Promise<AIParticipant> {
  const owner = (await getUserByUsername("user1"))!;
  const now = new Date().toISOString();
  const modelId = await ModelRepo.add({
    userId: owner.userId,
    gameKey: "nim",
    displayName,
    sourceRef: "local-training",
    artifactRef: "model.pth",
    visibility: "private",
    createdAt: now,
    updatedAt: now,
  });
  // The seat must be a REAL deployment: createGameWithAi renders the AI seat
  // through populateSafeUserInfo, which resolves deployment ids in
  // DeploymentRepo (a bare `dep-…` string would fail the user lookup).
  const deploymentId = await DeploymentRepo.add({
    modelId,
    userId: owner.userId,
    gameKey: "nim",
    displayName,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  return { deploymentId, modelId, displayName };
}

function makeIoRecorder() {
  const emits: { room: string; event: string; payload: Record<string, unknown> }[] = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: Record<string, unknown>) =>
        emits.push({ room, event, payload }),
    }),
  } as unknown as GameServer;
  return { io, emits };
}

describe("runAiTurns", () => {
  beforeEach(() => setAiMoveDelayForTests(0));
  afterEach(() => {
    resetAiMoveDelayForTests();
    resetInferenceClientForTests();
  });

  it("is a no-op for a game with no AI on turn", async () => {
    const { io, emits } = makeIoRecorder();
    await runAiTurns(io, randomUUID().toString());
    expect(emits).toHaveLength(0);
  });

  it("broadcasts each AI move as its own gameStateUpdated", async () => {
    // AI seat 0 opens (nim starts at nextPlayer 0), human seat 1 — exactly
    // one AI move expected before the loop yields to the human.
    const user0 = (await getUserByUsername("user0"))!;
    const aiSeat = await seedAiSeat("TurnBot v1");
    const game = await createGameWithAi(aiSeat, "nim", new Date(), false);
    await joinGame(game.gameId, user0);
    await startGame(game.gameId, { userId: aiSeat.deploymentId, username: "TurnBot v1" });

    setInferenceClientForTests({ requestMove: () => Promise.resolve({ move: 2 }) });
    const { io, emits } = makeIoRecorder();
    await runAiTurns(io, game.gameId);

    const stored = await GameRepo.get(game.gameId);
    expect(stored.state).toEqual({ remaining: 19, nextPlayer: 1 });
    const updates = emits.filter((e) => e.event === "gameStateUpdated" && e.room === game.gameId);
    expect(updates).toHaveLength(1);
    expect(updates[0].payload["forPlayer"]).toBe(false);
  });

  it("waits the configured delay before the move lands", async () => {
    const user0 = (await getUserByUsername("user0"))!;
    const aiSeat = await seedAiSeat("SlowBot v1");
    const game = await createGameWithAi(aiSeat, "nim", new Date(), false);
    await joinGame(game.gameId, user0);
    await startGame(game.gameId, { userId: aiSeat.deploymentId, username: "SlowBot v1" });

    setInferenceClientForTests({ requestMove: () => Promise.resolve({ move: 1 }) });
    setAiMoveDelayForTests(120);
    const { io, emits } = makeIoRecorder();

    const roomUpdates = () =>
      emits.filter((e) => e.event === "gameStateUpdated" && e.room === game.gameId);
    const running = runAiTurns(io, game.gameId);
    await new Promise((r) => setTimeout(r, 30));
    expect(roomUpdates()).toHaveLength(0);
    await running;
    expect(roomUpdates()).toHaveLength(1);
  });
});
