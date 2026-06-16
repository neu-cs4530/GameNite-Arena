import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import supertest from "supertest";
import * as gameCtrl from "../../src/controllers/game.controller.ts";
import { GameRepo } from "../../src/repository.ts";
import {
  createGame,
  joinGame,
  startGame,
} from "../../src/services/game.service.ts";
import { getUserByUsername } from "../../src/services/auth.service.ts";
import type { GameServer } from "../../src/types.ts";

const caster = { username: "user0", password: "pwd0000" };
const user1Auth = { username: "user1", password: "pwd1111" };

function makeApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/game",
    express
      .Router()
      .post("/create", gameCtrl.postCreate)
      .get("/list", gameCtrl.getList)
      .get("/:id", gameCtrl.getById),
  );
  return app;
}

function makeIo() {
  const emits: { room: string; event: string; payload: unknown }[] = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => emits.push({ room, event, payload }),
    }),
    sockets: { adapter: { rooms: new Map<string, Set<string>>() } },
  } as unknown as GameServer;
  return { io, emits };
}

function makeSocket(preJoinedRooms: string[] = []) {
  const rooms = new Set<string>(preJoinedRooms);
  const joined: string[] = [];
  const socket = {
    rooms,
    join: (r: string | string[]) => {
      const arr = Array.isArray(r) ? r : [r];
      arr.forEach((x) => {
        joined.push(x);
        rooms.add(x);
      });
      return Promise.resolve();
    },
    leave: (r: string) => {
      rooms.delete(r);
      return Promise.resolve();
    },
    emit: (_ev: string, _payload: unknown) => {},
  } as unknown as Parameters<typeof gameCtrl.socketWatch>[0];
  return { socket, joined };
}

beforeEach(async () => {
  await GameRepo.clear();
});

// ── REST ─────────────────────────────────────────────────────────────────────

describe("POST /api/game/create", () => {
  it("creates a nim game (200)", async () => {
    const res = await supertest(makeApp())
      .post("/api/game/create")
      .send({ auth: caster, payload: "nim" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ type: "nim", status: "waiting" });
    expect(typeof res.body.gameId).toBe("string");
  });

  it("returns 400 for a malformed body", async () => {
    const res = await supertest(makeApp()).post("/api/game/create").send({ wrong: true });
    expect(res.status).toBe(400);
  });

  it("returns 403 for invalid credentials", async () => {
    const res = await supertest(makeApp())
      .post("/api/game/create")
      .send({ auth: { username: "user0", password: "bad" }, payload: "nim" });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/game/:id", () => {
  it("returns the game for a known id (200)", async () => {
    const createRes = await supertest(makeApp())
      .post("/api/game/create")
      .send({ auth: caster, payload: "nim" });
    const { gameId } = createRes.body as { gameId: string };

    const res = await supertest(makeApp()).get(`/api/game/${gameId}`);
    expect(res.status).toBe(200);
    expect(res.body.gameId).toBe(gameId);
  });

  it("returns 404 for an unknown id", async () => {
    const res = await supertest(makeApp()).get("/api/game/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });
});

describe("GET /api/game/list", () => {
  it("returns an array (200)", async () => {
    const res = await supertest(makeApp()).get("/api/game/list");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("includes freshly-created games", async () => {
    await supertest(makeApp())
      .post("/api/game/create")
      .send({ auth: caster, payload: "nim" });
    const res = await supertest(makeApp()).get("/api/game/list");
    expect(res.status).toBe(200);
    expect((res.body as unknown[]).length).toBeGreaterThanOrEqual(1);
  });
});

// ── Socket handlers ───────────────────────────────────────────────────────────

describe("socketWatch", () => {
  it("joins a non-player only to the game room", async () => {
    const user0 = (await getUserByUsername("user0"))!;
    const info = await createGame(user0, "nim", new Date());
    const { io } = makeIo();
    const { socket, joined } = makeSocket();
    await gameCtrl.socketWatch(socket, io)({ auth: user1Auth, payload: info.gameId });
    expect(joined).toEqual([info.gameId]);
  });

  it("joins a player to the game room AND their private room", async () => {
    const user0 = (await getUserByUsername("user0"))!;
    const info = await createGame(user0, "nim", new Date());
    const { io } = makeIo();
    const { socket, joined } = makeSocket();
    await gameCtrl.socketWatch(socket, io)({ auth: caster, payload: info.gameId });
    expect(joined).toContain(info.gameId);
    expect(joined.length).toBe(2);
  });
});

describe("socketJoinAsPlayer", () => {
  it("skips re-joining a room the socket already occupies", async () => {
    const user0 = (await getUserByUsername("user0"))!;
    const user1 = (await getUserByUsername("user1"))!;
    const info = await createGame(user0, "nim", new Date());
    // Pre-seed the private room so the `if (!socket.rooms.has(...))` branch is false.
    const { io } = makeIo();
    const { socket, joined } = makeSocket([`${info.gameId}-${user1.userId}`]);
    await gameCtrl.socketJoinAsPlayer(socket, io)({ auth: user1Auth, payload: info.gameId });
    // join() should NOT have been called again for the already-present private room.
    expect(joined).not.toContain(`${info.gameId}-${user1.userId}`);
  });

  it("auto-starts the game when the joining player fills the last seat", async () => {
    const user0 = (await getUserByUsername("user0"))!;
    const info = await createGame(user0, "nim", new Date());
    const { io, emits } = makeIo();
    const { socket } = makeSocket();
    // nim maxPlayers=2; user0 already in seat 0 → user1 fills seat 1 → auto-start
    await gameCtrl.socketJoinAsPlayer(socket, io)({ auth: user1Auth, payload: info.gameId });
    // sendViewUpdates emits gameStateUpdated to the game room
    expect(emits.some((e) => e.event === "gameStateUpdated")).toBe(true);
  });
});

describe("socketStart", () => {
  it("emits view updates after the game is started manually", async () => {
    const user0 = (await getUserByUsername("user0"))!;
    const user1 = (await getUserByUsername("user1"))!;
    const info = await createGame(user0, "nim", new Date());
    await joinGame(info.gameId, user1);
    const { io, emits } = makeIo();
    const { socket } = makeSocket();
    await gameCtrl.socketStart(socket, io)({ auth: caster, payload: info.gameId });
    expect(emits.some((e) => e.event === "gameStateUpdated")).toBe(true);
  });
});

describe("socketMakeMove", () => {
  afterEach(() => {
    gameCtrl.resetAiMoveDelayForTests();
  });

  it("emits gameStateUpdated for a valid mid-game move", async () => {
    gameCtrl.setAiMoveDelayForTests(0);
    const user0 = (await getUserByUsername("user0"))!;
    const user1 = (await getUserByUsername("user1"))!;
    const info = await createGame(user0, "nim", new Date());
    await joinGame(info.gameId, user1);
    await startGame(info.gameId, user0);
    const { io, emits } = makeIo();
    const { socket } = makeSocket();
    await gameCtrl.socketMakeMove(socket, io)({
      auth: caster,
      payload: { gameId: info.gameId, move: 1 },
    });
    expect(emits.some((e) => e.event === "gameStateUpdated")).toBe(true);
  });

  it("emits gameResult when a rated move ends the game", async () => {
    gameCtrl.setAiMoveDelayForTests(0);
    const user0 = (await getUserByUsername("user0"))!;
    const user1 = (await getUserByUsername("user1"))!;
    const info = await createGame(user0, "nim", new Date(), true /* rated */);
    await joinGame(info.gameId, user1);
    await startGame(info.gameId, user0);
    // Drive nim to a near-done state: leave 1 stone so the next move wins.
    const game = await GameRepo.get(info.gameId);
    await GameRepo.set(info.gameId, { ...game, state: { remaining: 1, nextPlayer: 0 } });
    const { io, emits } = makeIo();
    const { socket } = makeSocket();
    await gameCtrl.socketMakeMove(socket, io)({
      auth: caster,
      payload: { gameId: info.gameId, move: 1 },
    });
    expect(emits.some((e) => e.event === "gameResult")).toBe(true);
  });
});

describe("sendViewUpdates", () => {
  it("emits a watcher event and per-player events", () => {
    const { io, emits } = makeIo();
    const fakeViews = {
      watchers: { type: "nim" as const, view: { remaining: 5, nextPlayer: 0 } },
      players: [
        { userId: "u-a", view: { type: "nim" as const, view: { remaining: 5, nextPlayer: 0 } } },
        { userId: "u-b", view: { type: "nim" as const, view: { remaining: 5, nextPlayer: 0 } } },
      ],
    };
    gameCtrl.sendViewUpdates(io, "game-xyz", fakeViews);
    expect(emits.length).toBe(3); // 1 watcher + 2 players
    expect(emits[0].event).toBe("gameStateUpdated");
  });
});
