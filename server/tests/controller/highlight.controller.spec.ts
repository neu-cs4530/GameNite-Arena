import { beforeEach, describe, expect, it } from "vitest";
import express from "express";
import supertest from "supertest";
import * as highlight from "../../src/controllers/highlight.controller.ts";
import { checkAuth } from "../../src/services/auth.service.ts";
import { startBroadcast } from "../../src/services/broadcast.service.ts";
import { matchRecorder } from "../../src/services/matchRecorder.service.ts";
import { GameRepo, HighlightRepo } from "../../src/repository.ts";
import type { GameRecord } from "../../src/models.ts";

// setup.ts reseeds the user repo (user0/pwd0000 ...) and resets the recorder
// before each test.
const caster = { username: "user0", password: "pwd0000" };

const activeGame: GameRecord = {
  type: "nim",
  state: { remaining: 9, nextPlayer: 1 },
  done: false,
  chat: "chat-x",
  players: ["u-a", "u-b"],
  aiPlayers: [],
  rated: true,
  createdAt: "2026-06-01T00:00:00.000Z",
  createdBy: "u-a",
};

function makeApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/highlight",
    express.Router().post("/create", highlight.postCreate).post("/list", highlight.postList),
  );
  return app;
}

/** Buffer `n` live moves for game-1 in the recorder (none finalize the game). */
async function recordMoves(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await matchRecorder.captureMove(activeGame, "game-1", "u-a", { take: i }, false);
  }
}

let broadcastId: string;

beforeEach(async () => {
  await HighlightRepo.clear();
  await GameRepo.set("game-1", activeGame);
  const user0 = await checkAuth(caster);
  if (!user0) throw new Error("seeded user0 missing");
  const bc = await startBroadcast(user0, "game-1", 0, new Date());
  broadcastId = bc.broadcastId;
});

describe("POST /api/highlight/create", () => {
  it("saves a clip of the last `movesBack` moves (200)", async () => {
    await recordMoves(10);
    const res = await supertest(makeApp())
      .post("/api/highlight/create")
      .send({ auth: caster, payload: { broadcastId, movesBack: 3 } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ broadcastId, gameId: "game-1", movesBack: 3, startIndex: 7 });
    expect(res.body.moves).toHaveLength(3);
    // The clip is the *last* 3 moves, in play order.
    expect((res.body.moves as { move: { take: number } }[]).map((m) => m.move.take)).toEqual([
      7, 8, 9,
    ]);
  });

  it("returns all moves when the match is shorter than the window", async () => {
    await recordMoves(2);
    const res = await supertest(makeApp())
      .post("/api/highlight/create")
      .send({ auth: caster, payload: { broadcastId } }); // default 7
    expect(res.status).toBe(200);
    expect(res.body.moves).toHaveLength(2);
  });

  it("returns 404 for an unknown broadcast", async () => {
    const res = await supertest(makeApp())
      .post("/api/highlight/create")
      .send({ auth: caster, payload: { broadcastId: "nope", movesBack: 5 } });
    expect(res.status).toBe(404);
  });

  it("returns 403 for invalid credentials", async () => {
    const res = await supertest(makeApp())
      .post("/api/highlight/create")
      .send({ auth: { username: "user0", password: "wrong" }, payload: { broadcastId } });
    expect(res.status).toBe(403);
  });

  it("lets a player highlight their own game by gameId (no broadcast needed)", async () => {
    const user0 = await checkAuth(caster);
    if (!user0) throw new Error("seeded user0 missing");
    await GameRepo.set("game-mine", { ...activeGame, players: [user0.userId] });
    const res = await supertest(makeApp())
      .post("/api/highlight/create")
      .send({ auth: caster, payload: { gameId: "game-mine", movesBack: 5 } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ gameId: "game-mine" });
    expect(res.body.broadcastId).toBeUndefined();
  });

  it("returns 403 when highlighting a game by gameId you're not playing", async () => {
    // game-1's players are u-a / u-b, not user0.
    const res = await supertest(makeApp())
      .post("/api/highlight/create")
      .send({ auth: caster, payload: { gameId: "game-1" } });
    expect(res.status).toBe(403);
  });

  it("returns 400 when neither gameId nor broadcastId is given", async () => {
    const res = await supertest(makeApp())
      .post("/api/highlight/create")
      .send({ auth: caster, payload: {} });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/highlight/list", () => {
  it("returns the user's highlights, newest first", async () => {
    await recordMoves(4);
    const app = makeApp();
    await supertest(app)
      .post("/api/highlight/create")
      .send({ auth: caster, payload: { broadcastId, note: "first" } });
    // Space the two saves apart so their capturedAt timestamps differ — without
    // this they can land in the same millisecond and the newest-first order is
    // ambiguous.
    await new Promise((resolve) => setTimeout(resolve, 10));
    await supertest(app)
      .post("/api/highlight/create")
      .send({ auth: caster, payload: { broadcastId, note: "second" } });

    const res = await supertest(app).post("/api/highlight/list").send({ auth: caster });
    expect(res.status).toBe(200);
    const notes = (res.body as { note?: string }[]).map((h) => h.note);
    expect(notes).toEqual(["second", "first"]);
  });

  it("only returns the caller's own highlights", async () => {
    await recordMoves(1);
    const app = makeApp();
    await supertest(app)
      .post("/api/highlight/create")
      .send({ auth: caster, payload: { broadcastId } });

    const res = await supertest(app)
      .post("/api/highlight/list")
      .send({ auth: { username: "user1", password: "pwd1111" } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
