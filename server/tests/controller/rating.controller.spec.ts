import { beforeEach, describe, expect, it } from "vitest";
import express from "express";
import supertest from "supertest";
import { ratingRouter } from "../../src/controllers/rating.controller.ts";
import { RatingRepo } from "../../src/repository.ts";
import { ratingKey } from "../../src/models.ts";
import { getUserByUsername } from "../../src/services/auth.service.ts";
import type { UserWithId } from "../../src/types.ts";

/* ---------------------------------------------------------------------------
 * Read-only player rating lookups for the matchmaking portal. Router-only
 * mount — same pattern as the deployment controller spec; no Redis anywhere.
 * ------------------------------------------------------------------------- */

function makeApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use("/api/rating", ratingRouter());
  return app;
}

let app: express.Express;
let user0: UserWithId;

async function seedRating(owner: UserWithId, rating: number, rd: number, gamesPlayed: number) {
  await RatingRepo.set(ratingKey({ entityType: "human", entityId: owner.userId, gameKey: "nim" }), {
    entityId: owner.userId,
    entityType: "human",
    gameKey: "nim",
    rating,
    rd,
    vol: 0.06,
    gamesPlayed,
    lastUpdatedAt: new Date().toISOString(),
  });
}

beforeEach(async () => {
  await RatingRepo.clear();
  app = makeApp();
  user0 = (await getUserByUsername("user0"))!;
});

describe("GET /api/rating/:gameKey/:username", () => {
  it("returns honest Glicko defaults for a player with no rated games", async () => {
    const res = await supertest(app).get("/api/rating/nim/user0");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      gameKey: "nim",
      username: "user0",
      rating: 1500,
      rd: 350,
      gamesPlayed: 0,
      provisional: true,
    });
  });

  it("returns the stored rating, settled once rd is low and games were played", async () => {
    await seedRating(user0, 1622, 120, 14);

    const res = await supertest(app).get("/api/rating/nim/user0");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      gameKey: "nim",
      username: "user0",
      rating: 1622,
      rd: 120,
      gamesPlayed: 14,
      provisional: false,
    });
  });

  it("stays provisional while rd is still high, even with games played", async () => {
    await seedRating(user0, 1540, 220, 5);

    const res = await supertest(app).get("/api/rating/nim/user0");
    expect(res.body.provisional).toBe(true);
  });

  it("stays provisional at zero games played, even if a record has low rd", async () => {
    await seedRating(user0, 1500, 100, 0);

    const res = await supertest(app).get("/api/rating/nim/user0");
    expect(res.body.provisional).toBe(true);
  });

  it("404s for an unknown username", async () => {
    const res = await supertest(app).get("/api/rating/nim/no-such-user");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "User not found" });
  });

  it("400s for a game key that is not playable", async () => {
    const res = await supertest(app).get("/api/rating/checkers/user0");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Unknown game" });
  });

  it("ratings are per-game: a nim record never leaks into guess", async () => {
    await seedRating(user0, 1700, 90, 30);

    const res = await supertest(app).get("/api/rating/guess/user0");
    expect(res.body).toMatchObject({ gameKey: "guess", rating: 1500, provisional: true });
  });
});
