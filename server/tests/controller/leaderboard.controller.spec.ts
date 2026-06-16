import { describe, expect, it } from "vitest";
import express from "express";
import supertest from "supertest";
import * as lb from "../../src/controllers/leaderboard.controller.ts";

// setup.ts reseeds the user repo and Redis-namespaces leaderboard cache before each test.

function makeApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use("/api/leaderboard", express.Router().get("/:gameKey", lb.getByGame));
  return app;
}

describe("GET /api/leaderboard/:gameKey", () => {
  it("returns 400 for an unknown game key", async () => {
    const res = await supertest(makeApp()).get("/api/leaderboard/chess");
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  it("returns 400 for a page value that is not a positive integer", async () => {
    const res = await supertest(makeApp()).get("/api/leaderboard/nim?page=0");
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  it("returns 400 for a limit over the maximum", async () => {
    const res = await supertest(makeApp()).get("/api/leaderboard/nim?limit=200");
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  it("returns 200 with a page envelope for a valid game key and defaults", async () => {
    const res = await supertest(makeApp()).get("/api/leaderboard/nim");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      entries: expect.any(Array),
      total: expect.any(Number),
      page: 1,
    });
  });

  it("returns 200 with type=human filter", async () => {
    const res = await supertest(makeApp()).get("/api/leaderboard/tictactoe?type=human");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ entries: expect.any(Array) });
  });

  it("returns 200 with period=daily", async () => {
    const res = await supertest(makeApp()).get("/api/leaderboard/connect4?period=daily");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ entries: expect.any(Array) });
  });

  it("returns 200 with fresh=1 (bypass cache)", async () => {
    const res = await supertest(makeApp()).get("/api/leaderboard/nim?fresh=1");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ entries: expect.any(Array) });
  });

  it("passes page and limit through to the response", async () => {
    const res = await supertest(makeApp()).get("/api/leaderboard/nim?page=1&limit=10");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1 });
  });
});
