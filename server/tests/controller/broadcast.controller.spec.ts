import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import supertest from "supertest";
import * as broadcast from "../../src/controllers/broadcast.controller.ts";
import { BroadcastRepo, GameRepo } from "../../src/repository.ts";
import type { GameRecord } from "../../src/models.ts";
import type { GameServer, GameServerSocket } from "../../src/types.ts";

/** A minimal socket exposing only join/leave (the bits the handlers use). */
function mockSocket(): GameServerSocket {
  return { id: "spec-socket", join: vi.fn(), leave: vi.fn() } as unknown as GameServerSocket;
}
const mockIo = {} as GameServer;

/* ---------------------------------------------------------------------------
 * We mount only the broadcast router (not the full `app`, which transitively
 * pulls in Redis-dependent services that won't init without REDIS_URL).
 * This exercises the same Router config as production server/src/app.ts.
 * ----------------------------------------------------------------------- */
function makeApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/broadcast",
    express
      .Router()
      .post("/create", broadcast.postCreate)
      .get("/list", broadcast.getList)
      .get("/:id", broadcast.getById)
      .post("/:id/end", broadcast.postEnd),
  );
  return app;
}

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
  await BroadcastRepo.clear();
  await GameRepo.set("game-1", activeGame);
});

async function startOne(delaySec = 10) {
  return supertest(makeApp())
    .post("/api/broadcast/create")
    .send({ auth: caster, payload: { gameId: "game-1", delaySec } });
}

describe("POST /api/broadcast/create", () => {
  it("starts a live broadcast of an in-progress game (200)", async () => {
    const res = await startOne(30);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ gameId: "game-1", delaySec: 30, status: "live" });
    expect(typeof res.body.broadcastId).toBe("string");
  });

  it("returns 400 for a delay above 60s", async () => {
    const res = await startOne(61);
    expect(res.status).toBe(400);
  });

  it("returns 400 for a negative delay", async () => {
    const res = await startOne(-1);
    expect(res.status).toBe(400);
  });

  it("returns 400 when the game is not in progress", async () => {
    await GameRepo.set("game-done", { ...activeGame, done: true });
    const res = await supertest(makeApp())
      .post("/api/broadcast/create")
      .send({ auth: caster, payload: { gameId: "game-done", delaySec: 0 } });
    expect(res.status).toBe(400);
  });

  it("returns 403 for invalid credentials", async () => {
    const res = await supertest(makeApp())
      .post("/api/broadcast/create")
      .send({
        auth: { username: "user0", password: "wrong" },
        payload: { gameId: "game-1", delaySec: 0 },
      });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/broadcast/list and /:id", () => {
  it("lists live broadcasts and fetches one by id", async () => {
    const created = await startOne();
    const { broadcastId } = created.body as { broadcastId: string };

    const list = await supertest(makeApp()).get("/api/broadcast/list");
    expect(list.status).toBe(200);
    const ids = (list.body as { broadcastId: string }[]).map((b) => b.broadcastId);
    expect(ids).toContain(broadcastId);

    const one = await supertest(makeApp()).get(`/api/broadcast/${broadcastId}`);
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({ broadcastId, status: "live" });
  });

  it("returns 404 for an unknown broadcast id", async () => {
    const res = await supertest(makeApp()).get("/api/broadcast/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });
});

describe("POST /api/broadcast/create — bad body", () => {
  it("returns 400 when the body is missing auth entirely", async () => {
    const res = await supertest(makeApp())
      .post("/api/broadcast/create")
      .send({ payload: { gameId: "game-1", delaySec: 10 } });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/broadcast/:id/end", () => {
  it("lets the broadcaster end their broadcast (200)", async () => {
    const created = await startOne();
    const { broadcastId } = created.body as { broadcastId: string };

    const res = await supertest(makeApp())
      .post(`/api/broadcast/${broadcastId}/end`)
      .send({ auth: caster });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ broadcastId, status: "ended" });
    expect(typeof res.body.endedAt).toBe("string");
  });

  it("returns 403 when a non-broadcaster tries to end it", async () => {
    const created = await startOne();
    const { broadcastId } = created.body as { broadcastId: string };

    const res = await supertest(makeApp())
      .post(`/api/broadcast/${broadcastId}/end`)
      .send({ auth: stranger });
    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown broadcast id", async () => {
    const res = await supertest(makeApp())
      .post("/api/broadcast/does-not-exist/end")
      .send({ auth: caster });
    expect(res.status).toBe(404);
  });

  it("returns 400 when the end request has no auth envelope", async () => {
    const { broadcastId } = (await startOne()).body as { broadcastId: string };
    const res = await supertest(makeApp()).post(`/api/broadcast/${broadcastId}/end`).send({});
    expect(res.status).toBe(400);
  });

  it("returns 403 for invalid credentials", async () => {
    const { broadcastId } = (await startOne()).body as { broadcastId: string };
    const res = await supertest(makeApp())
      .post(`/api/broadcast/${broadcastId}/end`)
      .send({ auth: { username: "user0", password: "wrong" } });
    expect(res.status).toBe(403);
  });
});

describe("socketBroadcastWatch / socketBroadcastLeave", () => {
  it("joins the broadcast room for a live broadcast", async () => {
    const { broadcastId } = (await startOne()).body as { broadcastId: string };
    const socket = mockSocket();

    await broadcast.socketBroadcastWatch(socket, mockIo)({ auth: caster, payload: broadcastId });

    expect(socket.join).toHaveBeenCalledTimes(1);
  });

  it("does not join when the broadcast is missing or not live", async () => {
    const socket = mockSocket();

    await broadcast.socketBroadcastWatch(socket, mockIo)({ auth: caster, payload: "no-such-id" });

    expect(socket.join).not.toHaveBeenCalled();
  });

  it("leaves the broadcast room", async () => {
    const socket = mockSocket();

    await broadcast.socketBroadcastLeave(socket, mockIo)({ auth: caster, payload: "any-id" });

    expect(socket.leave).toHaveBeenCalledTimes(1);
  });
});
