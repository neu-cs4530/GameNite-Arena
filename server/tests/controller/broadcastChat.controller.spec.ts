import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import supertest from "supertest";
import * as broadcastChat from "../../src/controllers/broadcastChat.controller.ts";
import { checkAuth } from "../../src/services/auth.service.ts";
import { startBroadcast } from "../../src/services/broadcast.service.ts";
import {
  getSlowMode,
  resetForTests,
  setSlowMode,
} from "../../src/services/broadcastChat.service.ts";
import { BroadcastRepo, GameRepo } from "../../src/repository.ts";
import type { GameRecord } from "../../src/models.ts";
import type { GameServer, GameServerSocket } from "../../src/types.ts";

// setup.ts reseeds the user repo (user0/pwd0000 ...) before each test.
const caster = { username: "user0", password: "pwd0000" };
const stranger = { username: "user1", password: "pwd1111" };

const activeGame: GameRecord = {
  type: "nim",
  state: { remaining: 5, nextPlayer: 1 },
  done: false,
  chat: "chat-x",
  players: ["u-a", "u-b"],
  aiPlayers: [],
  rated: true,
  createdAt: "2026-06-01T00:00:00.000Z",
  createdBy: "u-a",
};

beforeEach(async () => {
  resetForTests();
  await BroadcastRepo.clear();
  await GameRepo.set("game-1", activeGame);
});

/** A live broadcast owned by `userId`, returning its info. */
async function liveBroadcast(userId = "u-caster") {
  return startBroadcast({ userId, username: userId }, "game-1", 0, new Date());
}

function socketMocks() {
  const socketEmit = vi.fn();
  const ioEmit = vi.fn();
  const socket = { emit: socketEmit } as unknown as GameServerSocket;
  const io = { to: vi.fn(() => ({ emit: ioEmit })) } as unknown as GameServer;
  return { socket, io, socketEmit, ioEmit };
}

describe("POST /api/broadcast/:id/slowmode", () => {
  function makeApp(): express.Express {
    const app = express();
    app.use(express.json());
    app.use("/api/broadcast", express.Router().post("/:id/slowmode", broadcastChat.postSlowMode));
    return app;
  }

  it("lets the broadcaster set slow mode (200)", async () => {
    const user0 = await checkAuth(caster);
    if (!user0) throw new Error("seeded user0 missing");
    const bc = await startBroadcast(user0, "game-1", 0, new Date());

    const res = await supertest(makeApp())
      .post(`/api/broadcast/${bc.broadcastId}/slowmode`)
      .send({ auth: caster, payload: { seconds: 10 } });
    expect(res.status).toBe(200);
    expect(getSlowMode(bc.chatChannel)).toBe(10);
  });

  it("returns 404 for an unknown broadcast", async () => {
    const res = await supertest(makeApp())
      .post("/api/broadcast/nope/slowmode")
      .send({ auth: caster, payload: { seconds: 5 } });
    expect(res.status).toBe(404);
  });

  it("returns 400 for an out-of-range interval", async () => {
    const bc = await liveBroadcast();
    const res = await supertest(makeApp())
      .post(`/api/broadcast/${bc.broadcastId}/slowmode`)
      .send({ auth: caster, payload: { seconds: 99999 } });
    expect(res.status).toBe(400);
  });

  it("returns 403 when a non-broadcaster sets slow mode", async () => {
    // Broadcast owned by a different user id than either seeded account.
    const bc = await liveBroadcast("someone-else");
    const res = await supertest(makeApp())
      .post(`/api/broadcast/${bc.broadcastId}/slowmode`)
      .send({ auth: stranger, payload: { seconds: 5 } });
    expect(res.status).toBe(403);
  });
});

describe("socketBroadcastChatSend", () => {
  it("broadcasts an allowed message to the channel room", async () => {
    const bc = await liveBroadcast();
    const { socket, io, ioEmit } = socketMocks();

    await broadcastChat.socketBroadcastChatSend(
      socket,
      io,
    )({
      auth: caster,
      payload: { broadcastId: bc.broadcastId, text: "hello" },
    });

    expect(io.to).toHaveBeenCalledWith(bc.chatChannel);
    expect(ioEmit).toHaveBeenCalledWith(
      "chatNewMessage",
      expect.objectContaining({ chatId: bc.chatChannel }),
    );
  });

  it("rejects a message blocked by slow mode, notifying only the author", async () => {
    const bc = await liveBroadcast();
    setSlowMode(bc.chatChannel, 60);
    const { socket, io, socketEmit, ioEmit } = socketMocks();

    const send = () =>
      broadcastChat.socketBroadcastChatSend(
        socket,
        io,
      )({
        auth: caster,
        payload: { broadcastId: bc.broadcastId, text: "spam" },
      });

    await send(); // first message goes through
    await send(); // second is within the slow-mode interval

    expect(ioEmit).toHaveBeenCalledTimes(1); // only the first broadcast
    expect(socketEmit).toHaveBeenCalledWith(
      "broadcastChatRejected",
      expect.objectContaining({ broadcastId: bc.broadcastId, reason: "slow-mode" }),
    );
  });
});
