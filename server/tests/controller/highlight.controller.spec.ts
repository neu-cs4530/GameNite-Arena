import { beforeEach, describe, expect, it } from "vitest";
import express from "express";
import supertest from "supertest";
import * as highlight from "../../src/controllers/highlight.controller.ts";
import { checkAuth } from "../../src/services/auth.service.ts";
import { GameRepo, HighlightRepo } from "../../src/repository.ts";
import type { GameRecord } from "../../src/models.ts";

// setup.ts reseeds the user repo (user0/pwd0000 ...) before each test.
const caster = { username: "user0", password: "pwd0000" };
const stranger = { username: "user1", password: "pwd1111" };

function makeApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/highlight",
    express.Router().post("/create", highlight.postCreate).post("/list", highlight.postList),
  );
  return app;
}

beforeEach(async () => {
  await HighlightRepo.clear();
  // game-1 is an active match that user0 is playing in.
  const user0 = await checkAuth(caster);
  if (!user0) throw new Error("seeded user0 missing");
  const activeGame: GameRecord = {
    type: "nim",
    state: { remaining: 5, nextPlayer: 1 },
    done: false,
    chat: "chat-x",
    players: [user0.userId],
    aiPlayers: [],
    rated: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    createdBy: user0.userId,
  };
  await GameRepo.set("game-1", activeGame);
});

describe("POST /api/highlight/create", () => {
  it("lets a player bookmark the match they're in (200)", async () => {
    const res = await supertest(makeApp())
      .post("/api/highlight/create")
      .send({ auth: caster, payload: { gameId: "game-1", note: "nice fork" } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ gameId: "game-1", note: "nice fork" });
    expect(typeof res.body.highlightId).toBe("string");
    expect(typeof res.body.capturedAt).toBe("string");
  });

  it("returns 403 when the user is not a player in the game", async () => {
    const res = await supertest(makeApp())
      .post("/api/highlight/create")
      .send({ auth: stranger, payload: { gameId: "game-1" } });
    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown game", async () => {
    const res = await supertest(makeApp())
      .post("/api/highlight/create")
      .send({ auth: caster, payload: { gameId: "nope" } });
    expect(res.status).toBe(404);
  });

  it("returns 403 for invalid credentials", async () => {
    const res = await supertest(makeApp())
      .post("/api/highlight/create")
      .send({ auth: { username: "user0", password: "wrong" }, payload: { gameId: "game-1" } });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/highlight/list", () => {
  it("returns the user's highlights, newest first", async () => {
    const app = makeApp();
    await supertest(app)
      .post("/api/highlight/create")
      .send({ auth: caster, payload: { gameId: "game-1", note: "first" } });
    await supertest(app)
      .post("/api/highlight/create")
      .send({ auth: caster, payload: { gameId: "game-1", note: "second" } });

    const res = await supertest(app).post("/api/highlight/list").send({ auth: caster });
    expect(res.status).toBe(200);
    const notes = (res.body as { note?: string }[]).map((h) => h.note);
    expect(notes).toEqual(["second", "first"]);
  });

  it("only returns the caller's own highlights", async () => {
    const app = makeApp();
    await supertest(app)
      .post("/api/highlight/create")
      .send({ auth: caster, payload: { gameId: "game-1" } });

    const res = await supertest(app).post("/api/highlight/list").send({ auth: stranger });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
