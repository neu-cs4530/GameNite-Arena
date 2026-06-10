import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import supertest from "supertest";
import * as replay from "../../src/controllers/replay.controller.ts";
import {
  InMemoryReplayStore,
  makeDefaultStore,
  replaceStoreForTests,
} from "../../src/services/replay.service.ts";

/* ---------------------------------------------------------------------------
 * We mount only the replay router (not the full `app`, which transitively
 * pulls in Redis-dependent services that won't init without REDIS_URL).
 * This exercises the same Router config as production server/src/app.ts.
 * ----------------------------------------------------------------------- */
function makeApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/replay",
    express
      .Router()
      .get("/list", replay.getList)
      .get("/:matchId", replay.getById)
      .post("/:matchId/view", replay.postView),
  );
  return app;
}

beforeEach(() => {
  // Two fixtures: enough to exercise filters and pagination.
  replaceStoreForTests(
    new InMemoryReplayStore([
      {
        matchId: "ctrl-tic",
        gameId: "g-tic",
        gameKey: "tictactoe",
        rated: true,
        completedAt: "2026-05-30T00:00:00.000Z",
        moveCount: 7,
        watchCount: 42,
        participants: [
          {
            id: "u-a",
            type: "human",
            displayName: "Alice",
            username: "alice",
            ratingAtMatchTime: 1500,
          },
          {
            id: "u-b",
            type: "human",
            displayName: "Bob",
            username: "bob",
            ratingAtMatchTime: 1600,
          },
        ],
        result: { outcome: "win", winnerId: "u-a" },
        moves: [
          {
            index: 0,
            actor: "u-a",
            actorDisplayName: "Alice",
            move: { row: 1, col: 1 },
            notation: "X@center",
            timestamp: "2026-05-30T00:00:00.000Z",
          },
        ],
      },
      {
        matchId: "ctrl-c4",
        gameId: "g-c4",
        gameKey: "connect4",
        rated: false,
        completedAt: "2026-05-29T00:00:00.000Z",
        moveCount: 30,
        watchCount: 7,
        participants: [
          { id: "ai-1", type: "ai", displayName: "Botty", ratingAtMatchTime: 1800 },
          { id: "ai-2", type: "ai", displayName: "Otherbot", ratingAtMatchTime: 1700 },
        ],
        result: { outcome: "draw" },
        moves: [],
      },
    ]),
  );
});

afterEach(() => {
  replaceStoreForTests(makeDefaultStore());
});

describe("GET /api/replay/list", () => {
  it("returns the page envelope with 200", async () => {
    const res = await supertest(makeApp()).get("/api/replay/list");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: 2,
      page: 1,
      pageSize: 24,
    });
    expect(Array.isArray(res.body.replays)).toBe(true);
    expect(res.body.replays).toHaveLength(2);
  });

  it("returns only summary fields (no moves / gameId / initialState)", async () => {
    const res = await supertest(makeApp()).get("/api/replay/list");
    expect(res.status).toBe(200);
    const r = res.body.replays[0];
    expect(r).not.toHaveProperty("moves");
    expect(r).not.toHaveProperty("gameId");
    expect(r).not.toHaveProperty("initialState");
  });

  it("filters by games via repeated query params", async () => {
    const res = await supertest(makeApp()).get("/api/replay/list?games=tictactoe");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.replays[0].matchId).toBe("ctrl-tic");
  });

  it("filters by games via CSV", async () => {
    const res = await supertest(makeApp()).get("/api/replay/list?games=tictactoe,connect4");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });

  it("respects pagination params", async () => {
    const res = await supertest(makeApp()).get("/api/replay/list?page=1&pageSize=1");
    expect(res.status).toBe(200);
    expect(res.body.pageSize).toBe(1);
    expect(res.body.replays).toHaveLength(1);
    expect(res.body.total).toBe(2);
  });

  it("supports the most-viewed sort", async () => {
    const res = await supertest(makeApp()).get("/api/replay/list?sort=most-viewed");
    expect(res.status).toBe(200);
    const page = res.body as { replays: { matchId: string }[] };
    expect(page.replays.map((r) => r.matchId)).toEqual(["ctrl-tic", "ctrl-c4"]);
  });

  it("returns 400 for an invalid sort value", async () => {
    const res = await supertest(makeApp()).get("/api/replay/list?sort=not-real");
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  it("returns 400 for an invalid game key", async () => {
    const res = await supertest(makeApp()).get("/api/replay/list?games=chess");
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid result filter", async () => {
    const res = await supertest(makeApp()).get("/api/replay/list?results=bogus");
    expect(res.status).toBe(400);
  });

  it("returns 400 for a non-positive page", async () => {
    const res = await supertest(makeApp()).get("/api/replay/list?page=-1");
    expect(res.status).toBe(400);
  });

  it("returns 400 for pageSize over the cap", async () => {
    const res = await supertest(makeApp()).get("/api/replay/list?pageSize=500");
    expect(res.status).toBe(400);
  });

  it("filters by ratedOnly", async () => {
    const res = await supertest(makeApp()).get("/api/replay/list?ratedOnly=true");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.replays[0].matchId).toBe("ctrl-tic");
  });
});

describe("GET /api/replay/:matchId", () => {
  it("returns the detail body with 200", async () => {
    const res = await supertest(makeApp()).get("/api/replay/ctrl-tic");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      matchId: "ctrl-tic",
      gameId: "g-tic",
      gameKey: "tictactoe",
      moveCount: 7,
    });
    expect(res.body.moves).toHaveLength(1);
  });

  it("returns 404 for an unknown match id", async () => {
    const res = await supertest(makeApp()).get("/api/replay/no-such-match");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });
});

describe("POST /api/replay/:matchId/view", () => {
  it("returns 200 with the new watch count", async () => {
    const res = await supertest(makeApp()).post("/api/replay/ctrl-tic/view");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ matchId: "ctrl-tic", watchCount: 43 });
  });

  it("is repeatable: each call bumps the counter", async () => {
    const a = await supertest(makeApp()).post("/api/replay/ctrl-tic/view");
    const b = await supertest(makeApp()).post("/api/replay/ctrl-tic/view");
    const aBody = a.body as { watchCount: number };
    const bBody = b.body as { watchCount: number };
    expect(aBody.watchCount).toBe(43);
    expect(bBody.watchCount).toBe(44);
  });

  it("returns 404 for an unknown match id", async () => {
    const res = await supertest(makeApp()).post("/api/replay/ghost/view");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });
});

// The gameplay → replay pipeline (game.service → MatchRecorder → MatchRepo →
// /api/replay/*) is covered end-to-end in tests/integration/gameToReplay.spec.ts.
