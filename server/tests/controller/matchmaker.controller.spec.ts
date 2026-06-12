import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameServer, GameServerSocket } from "../../src/types.ts";
import { logSocketError } from "../../src/controllers/socket.controller.ts";
import { socketJoinQueue, socketLeaveQueue } from "../../src/controllers/matchmaker.controller.ts";
import {
  getQueueCounts,
  leaveQueue,
  runMatchmakingTick,
} from "../../src/services/matchmaker.service.ts";
import { getUserByUsername } from "../../src/services/auth.service.ts";
import { ratingKey } from "../../src/models.ts";
import { DeploymentRepo, ModelRepo, RatingRepo } from "../../src/repository.ts";

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
