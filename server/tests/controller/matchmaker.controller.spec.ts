import {
  setAiMoveDelayForTests,
  resetAiMoveDelayForTests,
} from "../../src/controllers/game.controller.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameServer, GameServerSocket } from "../../src/types.ts";
import { logSocketError } from "../../src/controllers/socket.controller.ts";
import {
  getQueueStatus,
  socketJoinQueue,
  socketLeaveQueue,
  startMatchedGame,
  startMatchmakerLoop,
} from "../../src/controllers/matchmaker.controller.ts";
import {
  getQueueCounts,
  joinQueue,
  leaveQueue,
  runMatchmakingTick,
  MAX_WAIT_MS,
  TICK_INTERVAL_MS,
  type QueueEntry,
} from "../../src/services/matchmaker.service.ts";
import { getUserByUsername } from "../../src/services/auth.service.ts";
import { ratingKey } from "../../src/models.ts";
import { DeploymentRepo, GameRepo, ModelRepo, RatingRepo } from "../../src/repository.ts";
import {
  resetInferenceClientForTests,
  setInferenceClientForTests,
} from "../../src/services/inferenceClient.ts";

/* ---------------------------------------------------------------------------
 * socketJoinQueue / socketLeaveQueue, including the queue-with-deployment
 * validation matrix (CoS 2.6): a deployment may only be queued by its owner,
 * while active, for its own game, and only for AI-playable games. Violations
 * follow the controller's existing bad-join pattern: logSocketError, no
 * enqueue.
 * ------------------------------------------------------------------------- */

vi.mock(import("../../src/controllers/socket.controller.ts"), () => {
  return { logSocketError: vi.fn() };
});

const MockGameServer = vi.fn(
  class {
    to = vi.fn(() => this);
    emit = vi.fn();
  },
);

const MockGameServerSocket = vi.fn(
  class {
    id = "socket-join-spec";
    join = vi.fn();
    emit = vi.fn();
    to = vi.fn(() => this);
  },
);

const mockServer = new MockGameServer() as unknown as GameServer;
const mockSocket = new MockGameServerSocket() as unknown as GameServerSocket;

const auth0 = { username: "user0", password: "pwd0000" };
const auth1 = { username: "user1", password: "pwd1111" };

async function seedDeployment(args: {
  ownerUsername: string;
  gameKey?: "nim" | "guess";
  status?: "active" | "paused" | "retired";
  displayName?: string;
}): Promise<{ deploymentId: string; modelId: string }> {
  const owner = (await getUserByUsername(args.ownerUsername))!;
  const now = new Date().toISOString();
  const modelId = await ModelRepo.add({
    userId: owner.userId,
    gameKey: args.gameKey ?? "nim",
    displayName: args.displayName ?? "QueueBot",
    sourceRef: "local-training",
    artifactRef: "model.pth",
    visibility: "private",
    createdAt: now,
    updatedAt: now,
  });
  const deploymentId = await DeploymentRepo.add({
    modelId,
    userId: owner.userId,
    gameKey: args.gameKey ?? "nim",
    displayName: args.displayName ?? "QueueBot",
    status: args.status ?? "active",
    createdAt: now,
    updatedAt: now,
  });
  return { deploymentId, modelId };
}

/** Drains anything this spec put in the module-level queue. */
async function drainQueue() {
  const user0 = (await getUserByUsername("user0"))!;
  const user1 = (await getUserByUsername("user1"))!;
  for (const gameKey of ["nim", "guess"] as const) {
    leaveQueue(user0.userId, gameKey);
    leaveQueue(user1.userId, gameKey);
  }
}

beforeEach(async () => {
  await DeploymentRepo.clear();
  await ModelRepo.clear();
  await RatingRepo.clear();
});

afterEach(async () => {
  await drainQueue();
  vi.resetAllMocks();
});

describe("socketJoinQueue (human)", () => {
  it("rejects a malformed payload", async () => {
    await socketJoinQueue(mockSocket, mockServer)({ auth: auth0, payload: { gameKey: "nim" } });
    expect(logSocketError).toHaveBeenCalledTimes(1);
    expect(getQueueCounts().nim.rated).toBe(0);
  });

  it("rejects bad auth", async () => {
    await socketJoinQueue(
      mockSocket,
      mockServer,
    )({ auth: { username: "user0", password: "wrong" }, payload: { gameKey: "nim", rated: true } });
    expect(logSocketError).toHaveBeenCalledExactlyOnceWith(mockSocket, new Error("Invalid auth"));
    expect(getQueueCounts().nim.rated).toBe(0);
  });

  it("queues a human with their own rating", async () => {
    const user0 = (await getUserByUsername("user0"))!;
    await RatingRepo.set(
      ratingKey({ entityType: "human", entityId: user0.userId, gameKey: "nim" }),
      {
        entityId: user0.userId,
        entityType: "human",
        gameKey: "nim",
        rating: 1620,
        rd: 80,
        vol: 0.05,
        gamesPlayed: 9,
        lastUpdatedAt: new Date().toISOString(),
      },
    );

    await socketJoinQueue(
      mockSocket,
      mockServer,
    )({ auth: auth0, payload: { gameKey: "nim", rated: true } });
    await socketJoinQueue(
      mockSocket,
      mockServer,
    )({ auth: auth1, payload: { gameKey: "nim", rated: true } });

    expect(logSocketError).not.toHaveBeenCalled();
    // user0 is 1620, user1 defaults to 1500: gap 120 only fits after a tick.
    const { matched } = runMatchmakingTick(new Date(Date.now() + 2000));
    expect(matched).toHaveLength(1);
    const entry0 = matched[0].find((e) => e.userId === user0.userId)!;
    expect(entry0.rating).toBe(1620);
    expect(entry0.aiSeat).toBeUndefined();
  });
});

describe("socketJoinQueue with a deployment", () => {
  it("queues the model with the MODEL's rating and an aiSeat", async () => {
    const { deploymentId, modelId } = await seedDeployment({ ownerUsername: "user0" });
    await RatingRepo.set(ratingKey({ entityType: "ai", entityId: modelId, gameKey: "nim" }), {
      entityId: modelId,
      entityType: "ai",
      gameKey: "nim",
      rating: 1550,
      rd: 90,
      vol: 0.05,
      gamesPlayed: 3,
      lastUpdatedAt: new Date().toISOString(),
    });

    await socketJoinQueue(
      mockSocket,
      mockServer,
    )({ auth: auth0, payload: { gameKey: "nim", rated: true, deploymentId } });
    await socketJoinQueue(
      mockSocket,
      mockServer,
    )({ auth: auth1, payload: { gameKey: "nim", rated: true } });

    expect(logSocketError).not.toHaveBeenCalled();

    // The model entry shares the human pool: it pairs with user1 (1500,
    // gap 50 fits the initial window).
    const { matched } = runMatchmakingTick(new Date());
    expect(matched).toHaveLength(1);
    const user0 = (await getUserByUsername("user0"))!;
    const modelEntry = matched[0].find((e) => e.userId === user0.userId)!;
    expect(modelEntry.rating).toBe(1550);
    expect(modelEntry.aiSeat).toEqual({ deploymentId, modelId, displayName: "QueueBot" });
  });

  it("rejects a deployment that does not exist", async () => {
    await socketJoinQueue(
      mockSocket,
      mockServer,
    )({ auth: auth0, payload: { gameKey: "nim", rated: true, deploymentId: "no-such-dep" } });

    expect(logSocketError).toHaveBeenCalledExactlyOnceWith(
      mockSocket,
      new Error("user user0 queued a deployment that does not exist"),
    );
    expect(getQueueCounts().nim.rated).toBe(0);
  });

  it("rejects a deployment the user does not own", async () => {
    const { deploymentId } = await seedDeployment({ ownerUsername: "user1" });

    await socketJoinQueue(
      mockSocket,
      mockServer,
    )({ auth: auth0, payload: { gameKey: "nim", rated: true, deploymentId } });

    expect(logSocketError).toHaveBeenCalledExactlyOnceWith(
      mockSocket,
      new Error("user user0 queued a deployment they do not own"),
    );
    expect(getQueueCounts().nim.rated).toBe(0);
  });

  it.each(["paused", "retired"] as const)("rejects a %s deployment", async (status) => {
    const { deploymentId } = await seedDeployment({ ownerUsername: "user0", status });

    await socketJoinQueue(
      mockSocket,
      mockServer,
    )({ auth: auth0, payload: { gameKey: "nim", rated: true, deploymentId } });

    expect(logSocketError).toHaveBeenCalledExactlyOnceWith(
      mockSocket,
      new Error("user user0 queued a deployment that is not active"),
    );
    expect(getQueueCounts().nim.rated).toBe(0);
  });

  it("rejects a deployment queued for a different game than its own", async () => {
    const { deploymentId } = await seedDeployment({ ownerUsername: "user0", gameKey: "guess" });

    await socketJoinQueue(
      mockSocket,
      mockServer,
    )({ auth: auth0, payload: { gameKey: "nim", rated: true, deploymentId } });

    expect(logSocketError).toHaveBeenCalledExactlyOnceWith(
      mockSocket,
      new Error("user user0 queued a guess deployment for nim"),
    );
    expect(getQueueCounts().nim.rated).toBe(0);
  });

  it("rejects a game models cannot play, even with a matching deployment", async () => {
    const { deploymentId } = await seedDeployment({ ownerUsername: "user0", gameKey: "guess" });

    await socketJoinQueue(
      mockSocket,
      mockServer,
    )({ auth: auth0, payload: { gameKey: "guess", rated: false, deploymentId } });

    expect(logSocketError).toHaveBeenCalledExactlyOnceWith(
      mockSocket,
      new Error("user user0 queued a model for guess, but models cannot play guess"),
    );
    expect(getQueueCounts().guess.unrated).toBe(0);
  });
});

describe("socketLeaveQueue", () => {
  it("removes the queued entry", async () => {
    await socketJoinQueue(
      mockSocket,
      mockServer,
    )({ auth: auth0, payload: { gameKey: "nim", rated: true } });
    expect(getQueueCounts().nim.rated).toBe(1);

    await socketLeaveQueue(mockSocket, mockServer)({ auth: auth0, payload: "nim" });
    expect(getQueueCounts().nim.rated).toBe(0);
  });

  it("logs instead of throwing on bad auth", async () => {
    await socketLeaveQueue(
      mockSocket,
      mockServer,
    )({ auth: { username: "user0", password: "wrong" }, payload: "nim" });
    expect(logSocketError).toHaveBeenCalledExactlyOnceWith(mockSocket, new Error("Invalid auth"));
  });
});

/* ---------------------------------------------------------------------------
 * startMatchedGame / startMatchmakerLoop: seating matched entries (human or
 * AI) into a created game, firing a seat-0 model's opening move, and the
 * tick loop's emissions.
 * ------------------------------------------------------------------------- */

describe("startMatchedGame", () => {
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

  async function queueEntry(
    username: "user0" | "user1",
    overrides: Partial<QueueEntry> = {},
  ): Promise<QueueEntry> {
    const user = (await getUserByUsername(username))!;
    return {
      userId: user.userId,
      username,
      gameKey: "nim",
      rating: 1500,
      rated: true,
      joinedAt: new Date(),
      socketId: `socket-${username}`,
      ...overrides,
    };
  }

  function findEmit(
    emits: { room: string; event: string; payload: Record<string, unknown> }[],
    event: string,
    room?: string,
  ) {
    return emits.filter((e) => e.event === event && (room === undefined || e.room === room));
  }

  beforeEach(() => setAiMoveDelayForTests(0));

  afterEach(() => {
    resetAiMoveDelayForTests();
    resetInferenceClientForTests();
    vi.restoreAllMocks();
  });

  it("starts a human-vs-human game and tells both sockets", async () => {
    const { io, emits } = makeIoRecorder();
    const a = await queueEntry("user0");
    const b = await queueEntry("user1");

    await startMatchedGame(io, a, b);

    const found = findEmit(emits, "matchFound");
    expect(found.map((e) => e.room).sort()).toEqual(["socket-user0", "socket-user1"]);
    const gameId = found[0].payload["gameId"] as string;
    expect(found[1].payload).toEqual({ gameId, gameKey: "nim" });

    const stored = await GameRepo.get(gameId);
    expect(stored.players).toEqual([a.userId, b.userId]);
    expect(stored.aiPlayers).toEqual([]);
    expect(stored.rated).toBe(true);
    expect(stored.state).toEqual({ remaining: 21, nextPlayer: 0 });
  });

  it("seats a model entry on seat 0 and lets it open the game", async () => {
    const { deploymentId, modelId } = await seedDeployment({ ownerUsername: "user0" });
    const requestMove = vi.fn().mockResolvedValue({ move: 3 });
    setInferenceClientForTests({ requestMove });
    const { io, emits } = makeIoRecorder();
    const a = await queueEntry("user0", {
      aiSeat: { deploymentId, modelId, displayName: "QueueBot" },
    });
    const b = await queueEntry("user1");

    await startMatchedGame(io, a, b);

    const found = findEmit(emits, "matchFound");
    expect(found).toHaveLength(2);
    const gameId = found[0].payload["gameId"] as string;

    const stored = await GameRepo.get(gameId);
    expect(stored.players).toEqual([deploymentId, b.userId]);
    expect(stored.aiPlayers[0]).toEqual({ deploymentId, modelId, displayName: "QueueBot" });
    // The model opened the game: 21 → 18, human to move.
    expect(stored.state).toEqual({ remaining: 18, nextPlayer: 1 });
    expect(requestMove).toHaveBeenCalledExactlyOnceWith({
      deploymentId,
      state: { remaining: 21 },
    });

    // The opening move must be DELIVERED, not just persisted: connected
    // clients hold the pre-move view and have no other way to learn the
    // board changed (the live stuck-at-21 bug).
    const watcherUpdates = findEmit(emits, "gameStateUpdated", gameId);
    expect(watcherUpdates).toHaveLength(1);
    expect(watcherUpdates[0].payload["forPlayer"]).toBe(false);
    const humanUpdates = findEmit(emits, "gameStateUpdated", `${gameId}-${b.userId}`);
    expect(humanUpdates).toHaveLength(1);
    expect(humanUpdates[0].payload["forPlayer"]).toBe(true);
  });

  it("seats a model entry on seat 1 without firing an opening move", async () => {
    const { deploymentId, modelId } = await seedDeployment({ ownerUsername: "user1" });
    const requestMove = vi.fn();
    setInferenceClientForTests({ requestMove });
    const { io, emits } = makeIoRecorder();
    const a = await queueEntry("user0");
    const b = await queueEntry("user1", {
      aiSeat: { deploymentId, modelId, displayName: "QueueBot" },
    });

    await startMatchedGame(io, a, b);

    const gameId = findEmit(emits, "matchFound")[0].payload["gameId"] as string;
    const stored = await GameRepo.get(gameId);
    expect(stored.players).toEqual([a.userId, deploymentId]);
    expect(stored.aiPlayers).toEqual([null, { deploymentId, modelId, displayName: "QueueBot" }]);
    // Seat 0 is human, so nobody moved yet.
    expect(stored.state).toEqual({ remaining: 21, nextPlayer: 0 });
    expect(requestMove).not.toHaveBeenCalled();
  });

  it("chains a model-vs-model game to completion and emits gameResult", async () => {
    const depA = await seedDeployment({ ownerUsername: "user0", displayName: "BotA" });
    const depB = await seedDeployment({ ownerUsername: "user1", displayName: "BotB" });
    const requestMove = vi.fn().mockResolvedValue({ move: 3 });
    setInferenceClientForTests({ requestMove });
    const { io, emits } = makeIoRecorder();
    const a = await queueEntry("user0", {
      aiSeat: { deploymentId: depA.deploymentId, modelId: depA.modelId, displayName: "BotA" },
    });
    const b = await queueEntry("user1", {
      aiSeat: { deploymentId: depB.deploymentId, modelId: depB.modelId, displayName: "BotB" },
    });

    await startMatchedGame(io, a, b);

    const gameId = findEmit(emits, "matchFound")[0].payload["gameId"] as string;
    const stored = await GameRepo.get(gameId);
    expect(stored.done).toBe(true);

    // Seven take-3 moves: seat 0 takes the last object, seat 1 wins.
    const results = findEmit(emits, "gameResult", gameId);
    expect(results).toHaveLength(1);
    expect(results[0].payload["winnerId"]).toBe(depB.deploymentId);
    expect(results[0].payload["outcome"]).toBe("win");
  });

  it("leaves the game playable when the opening AI move is rejected", async () => {
    const { deploymentId, modelId } = await seedDeployment({ ownerUsername: "user0" });
    const requestMove = vi.fn().mockResolvedValue({ move: 99 }); // illegal in nim
    setInferenceClientForTests({ requestMove });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { io, emits } = makeIoRecorder();
    const a = await queueEntry("user0", {
      aiSeat: { deploymentId, modelId, displayName: "QueueBot" },
    });
    const b = await queueEntry("user1");

    await startMatchedGame(io, a, b);

    // matchFound still went out, the board is untouched, and the failure was
    // logged rather than thrown.
    expect(findEmit(emits, "matchFound")).toHaveLength(2);
    const gameId = findEmit(emits, "matchFound")[0].payload["gameId"] as string;
    const stored = await GameRepo.get(gameId);
    expect(stored.state).toEqual({ remaining: 21, nextPlayer: 0 });
    expect(stored.done).toBe(false);
    expect(consoleError).toHaveBeenCalledWith(
      `AI turn failed for game ${gameId}:`,
      expect.anything(),
    );
  });
});

describe("startMatchmakerLoop", () => {
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

  afterEach(async () => {
    vi.useRealTimers();
    const user2 = (await getUserByUsername("user2"))!;
    const user3 = (await getUserByUsername("user3"))!;
    leaveQueue(user2.userId, "nim");
    leaveQueue(user3.userId, "guess");
    vi.restoreAllMocks();
  });

  it("pairs, times out, and reports windows on each tick", async () => {
    const user0 = (await getUserByUsername("user0"))!;
    const user1 = (await getUserByUsername("user1"))!;
    const user2 = (await getUserByUsername("user2"))!;
    const user3 = (await getUserByUsername("user3"))!;
    const base: Omit<QueueEntry, "userId" | "username" | "socketId"> = {
      gameKey: "nim",
      rating: 1500,
      rated: true,
      joinedAt: new Date(),
    };
    joinQueue({ ...base, userId: user0.userId, username: "user0", socketId: "s0" });
    joinQueue({ ...base, userId: user1.userId, username: "user1", socketId: "s1" });
    // user2 has waited past the cutoff: times out on this tick.
    joinQueue({
      ...base,
      userId: user2.userId,
      username: "user2",
      socketId: "s2",
      rated: false,
      joinedAt: new Date(Date.now() - MAX_WAIT_MS),
    });
    // user3 waits alone in another pool: stays queued, gets a window update.
    joinQueue({
      ...base,
      userId: user3.userId,
      username: "user3",
      socketId: "s3",
      gameKey: "guess",
    });

    vi.useFakeTimers();
    const { io, emits } = makeIoRecorder();
    const handle = startMatchmakerLoop(io);
    await vi.advanceTimersByTimeAsync(TICK_INTERVAL_MS);
    clearInterval(handle);
    vi.useRealTimers();
    // Let the in-flight startMatchedGame promise finish on real time.
    await new Promise((resolve) => setTimeout(resolve, 25));

    const found = emits.filter((e) => e.event === "matchFound");
    expect(found.map((e) => e.room).sort()).toEqual(["s0", "s1"]);
    const timeouts = emits.filter((e) => e.event === "matchmakingTimeout");
    expect(timeouts).toEqual([
      { room: "s2", event: "matchmakingTimeout", payload: { gameKey: "nim" } },
    ]);
    const windows = emits.filter((e) => e.event === "matchmakingWindowUpdate");
    expect(windows).toEqual([
      {
        room: "s3",
        event: "matchmakingWindowUpdate",
        payload: { gameKey: "guess", window: expect.any(Number) },
      },
    ]);
  });

  it("logs and keeps ticking when a matched game fails to start", async () => {
    const user0 = (await getUserByUsername("user0"))!;
    const user1 = (await getUserByUsername("user1"))!;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    // Both entries claim the SAME deployment seat: the second join collides,
    // so startMatchedGame rejects after matching.
    const aiSeat = { deploymentId: "dep-dup", modelId: "model-dup", displayName: "DupBot" };
    const base: Omit<QueueEntry, "userId" | "username" | "socketId"> = {
      gameKey: "nim",
      rating: 1500,
      rated: true,
      joinedAt: new Date(),
      aiSeat,
    };
    joinQueue({ ...base, userId: user0.userId, username: "user0", socketId: "s0" });
    joinQueue({ ...base, userId: user1.userId, username: "user1", socketId: "s1" });

    vi.useFakeTimers();
    const { io, emits } = makeIoRecorder();
    const handle = startMatchmakerLoop(io);
    await vi.advanceTimersByTimeAsync(TICK_INTERVAL_MS);
    clearInterval(handle);
    vi.useRealTimers();
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(emits.filter((e) => e.event === "matchFound")).toHaveLength(0);
    expect(consoleError).toHaveBeenCalledWith("failed to start matched game:", expect.any(Error));
  });
});

describe("getQueueStatus", () => {
  it("reports the per-game queue counts", async () => {
    const send = vi.fn();
    await getQueueStatus(
      {} as Parameters<typeof getQueueStatus>[0],
      { send } as unknown as Parameters<typeof getQueueStatus>[1],
    );
    expect(send).toHaveBeenCalledExactlyOnceWith({
      nim: { rated: 0, unrated: 0 },
      guess: { rated: 0, unrated: 0 },
    });
  });
});
