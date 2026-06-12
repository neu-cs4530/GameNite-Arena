import { beforeEach, describe, expect, it } from "vitest";
import express from "express";
import supertest from "supertest";
import * as profile from "../../src/controllers/profile.controller.ts";
import { ratingKey } from "../../src/models.ts";
import { MatchRepo, ModelRepo, PuzzleAttemptRepo, RatingRepo } from "../../src/repository.ts";
import { getUserByUsername } from "../../src/services/auth.service.ts";
import type { UserWithId } from "../../src/types.ts";

/* ---------------------------------------------------------------------------
 * GET /api/profile/:username — the aggregate ProfileSummary read surface.
 * Router-only mount mirroring server/src/app.ts; same pattern as the
 * deployment controller spec. No Redis anywhere.
 * ------------------------------------------------------------------------- */

function makeApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use("/api/profile", express.Router().get("/:username", profile.getProfileSummary));
  return app;
}

let app: express.Express;
let user0: UserWithId;
let user1: UserWithId;

beforeEach(async () => {
  // tests/setup.ts clears MatchRepo/WatchCountRepo and reseeds users.
  await RatingRepo.clear();
  await ModelRepo.clear();
  await PuzzleAttemptRepo.clear();
  app = makeApp();
  user0 = (await getUserByUsername("user0"))!;
  user1 = (await getUserByUsername("user1"))!;
});

describe("GET /api/profile/:username", () => {
  it("404s with an error body for an unknown username", async () => {
    const res = await supertest(app).get("/api/profile/no-such-user");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "User not found" });
  });

  it("serves the all-empty summary for a brand-new user", async () => {
    const res = await supertest(app).get("/api/profile/user3");

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("user3");
    expect(res.body.user.display).toBe("Frau Drei");
    expect(typeof res.body.user.createdAt).toBe("string"); // Date serializes on the wire

    expect(res.body.general.record).toEqual({ totalMatches: 0, wins: 0, losses: 0, draws: 0 });
    expect(res.body.general.peakElo).toBeNull();
    expect(res.body.general.averageElo).toBeNull();
    expect(res.body.general.bestAi).toBeNull();
    expect(res.body.general.mostViewed).toBeNull();
    expect(res.body.perGame).toEqual([]);
    expect(res.body.puzzles.overallRating).toBeNull();
    expect(res.body.puzzles.perGame).toEqual([]);
    expect(res.body.puzzles.recentAttempts).toEqual([]);
    expect(res.body.puzzles.streak).toEqual({ current: 0, best: 0 });
  });

  it("serves real aggregates built from the repos", async () => {
    await MatchRepo.set("m-ctrl", {
      gameId: "game-m-ctrl",
      gameKey: "nim",
      rated: true,
      participants: [
        { id: user0.userId, type: "human", displayName: "Me" },
        { id: user1.userId, type: "human", displayName: "Rival" },
      ],
      moves: [],
      result: {
        winnerId: user0.userId,
        outcome: "win",
        ratingChanges: [{ entityId: user0.userId, delta: 25 }],
      },
      createdAt: "2026-06-08T12:00:00.000Z",
      completedAt: "2026-06-08T12:00:00.000Z",
    });
    await RatingRepo.set(
      ratingKey({ entityType: "human", entityId: user0.userId, gameKey: "nim" }),
      {
        entityId: user0.userId,
        entityType: "human",
        gameKey: "nim",
        rating: 1525,
        rd: 80,
        vol: 0.06,
        gamesPlayed: 1,
        lastUpdatedAt: "2026-06-08T12:00:00.000Z",
      },
    );
    await PuzzleAttemptRepo.add({
      puzzleId: "nim:2026-06-08",
      attemptedBy: { id: user0.userId, type: "human" },
      success: true,
      rated: true,
      timeMs: 1500,
      hintsUsed: 0,
      eloDelta: 12,
      createdAt: "2026-06-08T13:00:00.000Z",
    });

    const res = await supertest(app).get("/api/profile/user0");

    expect(res.status).toBe(200);
    expect(res.body.general.record).toEqual({ totalMatches: 1, wins: 1, losses: 0, draws: 0 });
    expect(res.body.general.mostViewed.matchId).toBe("m-ctrl");
    expect(res.body.perGame).toHaveLength(1);
    expect(res.body.perGame[0].gameKey).toBe("nim");
    expect(res.body.perGame[0].rating).toEqual({
      current: 1525,
      peak: 1525,
      average: 1525,
      gamesPlayed: 1,
      provisional: false,
    });
    expect(res.body.puzzles.perGame).toEqual([
      {
        gameKey: "nim",
        rating: null,
        provisional: true,
        attempts: 1,
        solves: 1,
        solveRate: 1,
        avgTimeMs: 1500,
      },
    ]);
  });
});
