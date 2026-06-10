import { describe, expect, it } from "vitest";
import supertest, { type Response } from "supertest";
import { app } from "../src/app.ts";
import { dailyPuzzleKey } from "../src/models.ts";
import { PuzzleAttemptRepo, PuzzleRepo, UserRepo } from "../src/repository.ts";
import { getUserByUsername } from "../src/services/auth.service.ts";

let response: Response;

const auth1 = { username: "user1", password: "pwd1111" };
const authBad = { username: "user1", password: "wrong" };

const today = () => new Date().toISOString().slice(0, 10);

// the test db doesn't have a puzzle generated for today, so we add one
// ourselves with a known winning move to test against
async function seedPuzzle(winningMove: number) {
  await PuzzleRepo.set(dailyPuzzleKey({ gameKey: "nim", date: new Date() }), {
    gameKey: "nim",
    date: today(),
    position: { remaining: 4, nextPlayer: 1 },
    solution: { moves: [winningMove] },
    createdAt: new Date().toISOString(),
  });
}

describe("puzzle endpoints before today's puzzle has been generated", () => {
  it("GET /api/puzzle/:gameKey should return 404", async () => {
    response = await supertest(app).get("/api/puzzle/nim");
    expect(response.status).toBe(404);
  });

  it("POST /api/puzzle/:gameKey/attempt should return 404", async () => {
    response = await supertest(app)
      .post("/api/puzzle/nim/attempt")
      .send({ auth: auth1, payload: { move: 3, timeMs: 1000 } });
    expect(response.status).toBe(404);
  });
});

describe("GET /api/puzzle/:gameKey", () => {
  it("should return 400 for an unknown game", async () => {
    response = await supertest(app).get("/api/puzzle/notagame");
    expect(response.status).toBe(400);
  });

  it("should return today's puzzle once one has been generated", async () => {
    await seedPuzzle(3);

    response = await supertest(app).get("/api/puzzle/nim");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      gameKey: "nim",
      date: today(),
      solution: { moves: [3] },
    });
  });
});

describe("POST /api/puzzle/:gameKey/attempt", () => {
  it("should return 400 for an unknown game", async () => {
    response = await supertest(app)
      .post("/api/puzzle/notagame/attempt")
      .send({ auth: auth1, payload: { move: 3, timeMs: 1000 } });
    expect(response.status).toBe(400);
  });

  it("should return 400 for a poorly-formed payload", async () => {
    response = await supertest(app)
      .post("/api/puzzle/nim/attempt")
      .send({ auth: auth1, payload: { move: 3, timeMs: -1 } });
    expect(response.status).toBe(400);
  });

  it("should return 403 with bad auth", async () => {
    await seedPuzzle(3);

    response = await supertest(app)
      .post("/api/puzzle/nim/attempt")
      .send({ auth: authBad, payload: { move: 3, timeMs: 1000 } });
    expect(response.status).toBe(403);
  });

  it("should raise the player's rating and start a streak on a correct guess", async () => {
    await seedPuzzle(3);
    const user = (await getUserByUsername("user1"))!;
    const before = await UserRepo.get(user.userId);

    response = await supertest(app)
      .post("/api/puzzle/nim/attempt")
      .send({ auth: auth1, payload: { move: 3, timeMs: 1500 } });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.eloDelta).toBeGreaterThan(0);
    expect(response.body.newRating.rating).toBeGreaterThan(before.puzzleRating.rating);
    expect(response.body.newRating.rd).toBeLessThan(before.puzzleRating.rd);
    expect(response.body.streak).toStrictEqual({ current: 1, best: 1, lastSolvedAt: today() });

    // make sure the new rating and streak actually got saved on the user too
    const after = await UserRepo.get(user.userId);
    expect(after.puzzleRating).toStrictEqual(response.body.newRating);
    expect(after.puzzleStreak).toStrictEqual(response.body.streak);
  });

  it("should lower the player's rating and not touch the streak on a wrong guess", async () => {
    await seedPuzzle(3);
    const user = (await getUserByUsername("user1"))!;
    const before = await UserRepo.get(user.userId);

    response = await supertest(app)
      .post("/api/puzzle/nim/attempt")
      .send({ auth: auth1, payload: { move: 1, timeMs: 1500 } });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(false);
    expect(response.body.eloDelta).toBeLessThan(0);
    expect(response.body.newRating.rating).toBeLessThan(before.puzzleRating.rating);
    expect(response.body.streak).toStrictEqual(before.puzzleStreak);
  });

  it("should not extend the streak again on a second solve the same day", async () => {
    await seedPuzzle(3);
    const attempt = { auth: auth1, payload: { move: 3, timeMs: 1500 } };

    response = await supertest(app).post("/api/puzzle/nim/attempt").send(attempt);
    expect(response.body.streak).toStrictEqual({ current: 1, best: 1, lastSolvedAt: today() });

    // solving it again the same day shouldn't bump the streak further
    response = await supertest(app).post("/api/puzzle/nim/attempt").send(attempt);
    expect(response.body.streak).toStrictEqual({ current: 1, best: 1, lastSolvedAt: today() });
  });

  it("should continue a streak that was last extended yesterday", async () => {
    await seedPuzzle(3);
    const user = (await getUserByUsername("user1"))!;
    const userRecord = await UserRepo.get(user.userId);

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    await UserRepo.set(user.userId, {
      ...userRecord,
      puzzleStreak: { current: 5, best: 5, lastSolvedAt: yesterday },
    });

    response = await supertest(app)
      .post("/api/puzzle/nim/attempt")
      .send({ auth: auth1, payload: { move: 3, timeMs: 1500 } });

    expect(response.status).toBe(200);
    expect(response.body.streak).toStrictEqual({ current: 6, best: 6, lastSolvedAt: today() });
  });

  it("should log the attempt with hints used", async () => {
    await seedPuzzle(3);
    const puzzleKey = dailyPuzzleKey({ gameKey: "nim", date: new Date() });

    response = await supertest(app)
      .post("/api/puzzle/nim/attempt")
      .send({ auth: auth1, payload: { move: 3, timeMs: 1500, hintsUsed: 1 } });
    expect(response.status).toBe(200);

    const attempts = await PuzzleAttemptRepo.getMany(await PuzzleAttemptRepo.getAllKeys());
    expect(attempts).toContainEqual(
      expect.objectContaining({
        puzzleId: puzzleKey,
        success: true,
        timeMs: 1500,
        hintsUsed: 1,
      }),
    );
  });
});
