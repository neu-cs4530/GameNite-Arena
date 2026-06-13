import { beforeEach, describe, expect, it } from "vitest";
import supertest, { type Response } from "supertest";
import { app } from "../src/app.ts";
import { dailyPuzzleKey, type MatchRecord } from "../src/models.ts";
import {
  MatchRepo,
  PuzzleAttemptRepo,
  PuzzleHintRepo,
  PuzzleRepo,
  UserRepo,
} from "../src/repository.ts";
import { getUserByUsername } from "../src/services/auth.service.ts";
import { invalidatePuzzleLeaderboardCache } from "../src/services/puzzleLeaderboard.service.ts";
import { dayBefore } from "../src/services/puzzleStreak.util.ts";

let response: Response;

const auth1 = { username: "user1", password: "pwd1111" };
const authBad = { username: "user1", password: "wrong" };

const today = () => new Date().toISOString().slice(0, 10);

// A fixed puzzle day that is never the real "today" — proves the payload's
// date pins grading rather than the server clock.
// Yesterday: the legitimate midnight-straddle case (a session loaded the
// puzzle just before UTC midnight, submits just after). Older dates are
// refused by the server, so the pinned date must stay inside that window.
const PINNED_DATE = dayBefore(today());

// the test db doesn't have a puzzle generated for today, so we add one
// ourselves with a known position to grade against ({remaining: 6}: the only
// winning move is take 1, leaving 5 ≡ 1 mod 4)
async function seedPuzzle(date: string, solutionMoves: number[] = [1]) {
  await PuzzleRepo.set(`nim:${date}`, {
    gameKey: "nim",
    date,
    position: { remaining: 6, nextPlayer: 1 },
    solution: { moves: solutionMoves, explanation: "seeded by test" },
    createdAt: new Date().toISOString(),
  });
}

beforeEach(async () => {
  // deterministic daily keys + the redis-cached leaderboard would otherwise
  // leak between tests in this file
  await PuzzleRepo.clear();
  await PuzzleAttemptRepo.clear();
  await PuzzleHintRepo.clear();
  await invalidatePuzzleLeaderboardCache("nim");
  await invalidatePuzzleLeaderboardCache("guess");
});

describe("puzzle endpoints before today's puzzle has been generated", () => {
  it("GET /api/puzzle/:gameKey should return 404", async () => {
    response = await supertest(app).get("/api/puzzle/nim");
    expect(response.status).toBe(404);
  });

  it("POST /api/puzzle/:gameKey/attempt should return 404", async () => {
    response = await supertest(app)
      .post("/api/puzzle/nim/attempt")
      .send({ auth: auth1, payload: { move: 1, timeMs: 1000, date: today() } });
    expect(response.status).toBe(404);
  });

  it("POST /api/puzzle/:gameKey/hint should return 404", async () => {
    response = await supertest(app)
      .post("/api/puzzle/nim/hint")
      .send({ auth: auth1, payload: { date: today() } });
    expect(response.status).toBe(404);
  });
});

describe("GET /api/puzzle/:gameKey", () => {
  it("should return 404 for an unknown game", async () => {
    response = await supertest(app).get("/api/puzzle/notagame");
    expect(response.status).toBe(404);
  });

  it("should serve the PuzzleView shape — including date, NEVER the solution", async () => {
    await seedPuzzle(today());

    response = await supertest(app).get("/api/puzzle/nim");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      gameKey: "nim",
      date: today(),
      position: { remaining: 6, nextPlayer: 1 },
    });
    // the solution leak is closed: hints are a separate authed endpoint
    expect(response.body).not.toHaveProperty("solution");
    // no ?for= means no viewer standing either
    expect(response.body).not.toHaveProperty("viewerAttempt");
  });

  it("should report the viewer's standing against this puzzle with ?for=<username>", async () => {
    await seedPuzzle(today());

    response = await supertest(app).get("/api/puzzle/nim?for=user1");
    expect(response.status).toBe(200);
    expect(response.body.viewerAttempt).toStrictEqual({
      attempted: false,
      solved: false,
      rated: false,
    });

    // a failed rated attempt: attempted + rated, not solved
    await supertest(app)
      .post("/api/puzzle/nim/attempt")
      .send({ auth: auth1, payload: { move: 3, timeMs: 800, date: today() } });
    response = await supertest(app).get("/api/puzzle/nim?for=user1");
    expect(response.body.viewerAttempt).toStrictEqual({
      attempted: true,
      solved: false,
      rated: true,
    });

    // a later practice solve flips solved
    await supertest(app)
      .post("/api/puzzle/nim/attempt")
      .send({ auth: auth1, payload: { move: 1, timeMs: 500, date: today() } });
    response = await supertest(app).get("/api/puzzle/nim?for=user1");
    expect(response.body.viewerAttempt).toStrictEqual({
      attempted: true,
      solved: true,
      rated: true,
    });
  });

  it("should serve viewerAttempt null for an unknown username", async () => {
    await seedPuzzle(today());

    response = await supertest(app).get("/api/puzzle/nim?for=nobody-here");
    expect(response.status).toBe(200);
    expect(response.body.viewerAttempt).toBeNull();
  });

  it("should return 404 for guess — not a daily-puzzle game (position isn't deducible)", async () => {
    // even with a finished guess match in the archive to mine from
    const guessMatch: MatchRecord = {
      gameId: "game-guess-404",
      gameKey: "guess",
      rated: false,
      participants: ["u-g0", "u-g1", "u-g2", "u-g3"].map((id, i) => ({
        id,
        type: "human",
        displayName: `Guesser ${i}`,
      })),
      moves: [10, 55, 80, 41].map((guess, i) => ({
        actor: `u-g${i}`,
        move: guess,
        timestamp: `2026-06-09T01:0${i}:00.000Z`,
      })),
      result: { outcome: "win", winnerId: "u-g3" },
      initialState: { secret: 40, guesses: [null, null, null, null] },
      createdAt: "2026-06-09T01:10:00.000Z",
      completedAt: "2026-06-09T01:10:00.000Z",
    };
    await MatchRepo.set("match-guess-404", guessMatch);

    response = await supertest(app).get("/api/puzzle/guess");
    expect(response.status).toBe(404);
  });
});

describe("POST /api/puzzle/:gameKey/attempt", () => {
  it("should return 404 for an unknown game", async () => {
    response = await supertest(app)
      .post("/api/puzzle/notagame/attempt")
      .send({ auth: auth1, payload: { move: 1, timeMs: 1000, date: today() } });
    expect(response.status).toBe(404);
  });

  it("should return 400 for a poorly-formed payload", async () => {
    await seedPuzzle(today());

    // negative time
    response = await supertest(app)
      .post("/api/puzzle/nim/attempt")
      .send({ auth: auth1, payload: { move: 1, timeMs: -1, date: today() } });
    expect(response.status).toBe(400);

    // missing date — the client MUST echo the date it rendered
    response = await supertest(app)
      .post("/api/puzzle/nim/attempt")
      .send({ auth: auth1, payload: { move: 1, timeMs: 1000 } });
    expect(response.status).toBe(400);

    // malformed date
    response = await supertest(app)
      .post("/api/puzzle/nim/attempt")
      .send({ auth: auth1, payload: { move: 1, timeMs: 1000, date: "06/10/2026" } });
    expect(response.status).toBe(400);
  });

  it("should return 403 with bad auth", async () => {
    await seedPuzzle(today());

    response = await supertest(app)
      .post("/api/puzzle/nim/attempt")
      .send({ auth: authBad, payload: { move: 1, timeMs: 1000, date: today() } });
    expect(response.status).toBe(403);
  });

  it("should raise the player's rating and start a streak on a correct solve", async () => {
    await seedPuzzle(today());
    const user = (await getUserByUsername("user1"))!;

    response = await supertest(app)
      .post("/api/puzzle/nim/attempt")
      .send({ auth: auth1, payload: { move: 1, timeMs: 1500, date: today() } });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.rated).toBe(true);
    expect(response.body.eloDelta).toBeGreaterThan(0);
    // per-game rating starts from the 1500/350 default on the first rated attempt
    expect(response.body.newRating.rating).toBeGreaterThan(1500);
    expect(response.body.newRating.rd).toBeLessThan(350);
    expect(response.body.streak).toStrictEqual({ current: 1, best: 1, lastSolvedAt: today() });
    // the verdict panel still teaches: solution + explanation ride the response
    expect(response.body.solutionMove).toBe(1);
    expect(response.body.explanation).toBe("seeded by test");

    // make sure the new rating and streak actually got saved on the user too
    const after = await UserRepo.get(user.userId);
    expect(after.puzzleRatings.nim).toStrictEqual(response.body.newRating);
    expect(after.puzzleStreak).toStrictEqual(response.body.streak);
  });

  it("should lower the player's rating and not touch the streak on a wrong move", async () => {
    await seedPuzzle(today());
    const user = (await getUserByUsername("user1"))!;

    response = await supertest(app)
      .post("/api/puzzle/nim/attempt")
      .send({ auth: auth1, payload: { move: 3, timeMs: 1500, date: today() } });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(false);
    expect(response.body.rated).toBe(true);
    expect(response.body.eloDelta).toBeLessThan(0);
    expect(response.body.newRating.rating).toBeLessThan(1500);
    expect(response.body.streak).toStrictEqual({ current: 0, best: 0 });

    const after = await UserRepo.get(user.userId);
    expect(after.puzzleRatings.nim).toStrictEqual(response.body.newRating);
    expect(after.puzzleStreak).toStrictEqual({ current: 0, best: 0 });
  });

  it("should grade against the puzzle pinned by the payload's date, not the server clock", async () => {
    await seedPuzzle(PINNED_DATE);
    const user = (await getUserByUsername("user1"))!;

    // today has no puzzle: an attempt dated today 404s even though a puzzle exists
    response = await supertest(app)
      .post("/api/puzzle/nim/attempt")
      .send({ auth: auth1, payload: { move: 1, timeMs: 900, date: today() } });
    expect(response.status).toBe(404);

    // the pinned date grades, rates, and records against THAT puzzle-day
    response = await supertest(app)
      .post("/api/puzzle/nim/attempt")
      .send({ auth: auth1, payload: { move: 1, timeMs: 900, date: PINNED_DATE } });
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.rated).toBe(true);
    expect(response.body.streak).toStrictEqual({
      current: 1,
      best: 1,
      lastSolvedAt: PINNED_DATE,
    });

    const after = await UserRepo.get(user.userId);
    expect(after.puzzleLastRatedAt?.nim).toBe(PINNED_DATE);
  });

  it("should not extend the streak again on a second solve the same day", async () => {
    await seedPuzzle(today());
    const attempt = { auth: auth1, payload: { move: 1, timeMs: 1500, date: today() } };

    response = await supertest(app).post("/api/puzzle/nim/attempt").send(attempt);
    expect(response.body.streak).toStrictEqual({ current: 1, best: 1, lastSolvedAt: today() });

    // solving it again the same day is practice: no streak bump, no rating move
    response = await supertest(app).post("/api/puzzle/nim/attempt").send(attempt);
    expect(response.body.rated).toBe(false);
    expect(response.body.eloDelta).toBe(0);
    expect(response.body.streak).toStrictEqual({ current: 1, best: 1, lastSolvedAt: today() });
  });

  it("should continue a streak that was last extended yesterday", async () => {
    await seedPuzzle(today());
    const user = (await getUserByUsername("user1"))!;
    const userRecord = await UserRepo.get(user.userId);

    await UserRepo.set(user.userId, {
      ...userRecord,
      puzzleStreak: { current: 5, best: 5, lastSolvedAt: dayBefore(today()) },
    });

    response = await supertest(app)
      .post("/api/puzzle/nim/attempt")
      .send({ auth: auth1, payload: { move: 1, timeMs: 1500, date: today() } });

    expect(response.status).toBe(200);
    expect(response.body.streak).toStrictEqual({ current: 6, best: 6, lastSolvedAt: today() });
  });

  it("should advance the streak on a same-day retry solve after a failed rated attempt", async () => {
    await seedPuzzle(today());

    // the failed rated attempt spends the slot...
    response = await supertest(app)
      .post("/api/puzzle/nim/attempt")
      .send({ auth: auth1, payload: { move: 3, timeMs: 700, date: today() } });
    expect(response.body.rated).toBe(true);
    expect(response.body.streak).toStrictEqual({ current: 0, best: 0 });

    // ...but the genuine solve still counts toward the streak
    response = await supertest(app)
      .post("/api/puzzle/nim/attempt")
      .send({ auth: auth1, payload: { move: 1, timeMs: 400, date: today() } });
    expect(response.body.rated).toBe(false);
    expect(response.body.streak).toStrictEqual({ current: 1, best: 1, lastSolvedAt: today() });
  });

  it("should log the attempt with the rated flag and server-derived hint state", async () => {
    await seedPuzzle(today());
    const puzzleKey = dailyPuzzleKey({ gameKey: "nim", date: new Date() });

    response = await supertest(app)
      .post("/api/puzzle/nim/attempt")
      .send({ auth: auth1, payload: { move: 1, timeMs: 1500, date: today() } });
    expect(response.status).toBe(200);

    const attempts = await PuzzleAttemptRepo.getMany(await PuzzleAttemptRepo.getAllKeys());
    expect(attempts).toContainEqual(
      expect.objectContaining({
        puzzleId: puzzleKey,
        success: true,
        rated: true,
        timeMs: 1500,
        hintsUsed: 0,
      }),
    );
  });
});

describe("POST /api/puzzle/:gameKey/hint", () => {
  it("should return 404 for an unknown game", async () => {
    response = await supertest(app)
      .post("/api/puzzle/notagame/hint")
      .send({ auth: auth1, payload: { date: today() } });
    expect(response.status).toBe(404);
  });

  it("should return 400 for a poorly-formed payload", async () => {
    await seedPuzzle(today());

    response = await supertest(app).post("/api/puzzle/nim/hint").send({ auth: auth1, payload: {} });
    expect(response.status).toBe(400);
  });

  it("should return 403 with bad auth", async () => {
    await seedPuzzle(today());

    response = await supertest(app)
      .post("/api/puzzle/nim/hint")
      .send({ auth: authBad, payload: { date: today() } });
    expect(response.status).toBe(403);
  });

  it("should reveal the solution move and make every later attempt unrated", async () => {
    await seedPuzzle(today());

    response = await supertest(app)
      .post("/api/puzzle/nim/hint")
      .send({ auth: auth1, payload: { date: today() } });

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({ hintMove: 1, explanation: "seeded by test" });

    // the hinted solve is graded but can never rate or advance the streak
    response = await supertest(app)
      .post("/api/puzzle/nim/attempt")
      .send({ auth: auth1, payload: { move: 1, timeMs: 200, date: today() } });
    expect(response.body.success).toBe(true);
    expect(response.body.rated).toBe(false);
    expect(response.body.eloDelta).toBe(0);
    expect(response.body.streak).toStrictEqual({ current: 0, best: 0 });

    const attempts = await PuzzleAttemptRepo.getMany(await PuzzleAttemptRepo.getAllKeys());
    expect(attempts).toContainEqual(expect.objectContaining({ hintsUsed: 1, rated: false }));
  });
});

describe("GET /api/puzzle/leaderboard", () => {
  it("should return 400 for an unknown scope", async () => {
    response = await supertest(app).get("/api/puzzle/leaderboard?game=notagame");
    expect(response.status).toBe(400);
  });

  it("should default to the overall scope with an empty board when nobody is rated", async () => {
    response = await supertest(app).get("/api/puzzle/leaderboard");
    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      scope: "overall",
      entries: [],
      page: 1,
      pageSize: 50,
      total: 0,
    });
  });

  it("should reflect a rated solve immediately (submitAttempt invalidates the cache)", async () => {
    await seedPuzzle(today());

    // warm the cache with an empty board
    response = await supertest(app).get("/api/puzzle/leaderboard?game=nim");
    expect(response.body.total).toBe(0);

    await supertest(app)
      .post("/api/puzzle/nim/attempt")
      .send({ auth: auth1, payload: { move: 1, timeMs: 500, date: today() } });

    response = await supertest(app).get("/api/puzzle/leaderboard?game=nim");
    expect(response.status).toBe(200);
    expect(response.body.scope).toBe("nim");
    expect(response.body.total).toBe(1);
    expect(response.body.entries[0]).toMatchObject({
      rank: 1,
      username: "user1",
      attempts: 1,
      solves: 1,
      solveRate: 1,
      streakCurrent: 1,
      streakBest: 1,
    });
    expect(response.body.entries[0].rating).toBeGreaterThan(1500);
  });
});

describe("GET /api/puzzle/:gameKey lazy generation", () => {
  /**
   * A SOUND 11-move misère nim match: Alice always takes 3, Bob replies 1 —
   * each Bob move leaves remaining ≡ 1 (mod 4), so the split move is
   * genuinely winning and the miner accepts it. Alice takes the last token.
   */
  const archivedNimWin: MatchRecord = {
    gameId: "game-lazy-1",
    gameKey: "nim",
    rated: true,
    participants: [
      { id: "u-a", type: "human", displayName: "Alice" },
      { id: "u-b", type: "human", displayName: "Bob" },
    ],
    moves: [3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 1].map((take, i) => ({
      actor: i % 2 === 0 ? "u-a" : "u-b",
      move: take,
      timestamp: `2026-06-09T00:${String(i).padStart(2, "0")}:00.000Z`,
    })),
    result: { outcome: "win", winnerId: "u-b" },
    initialState: { remaining: 21, nextPlayer: 0 },
    createdAt: "2026-06-09T00:30:00.000Z",
    completedAt: "2026-06-09T00:30:00.000Z",
  };

  it("generates today's puzzle from the archive when the cron has not run", async () => {
    await MatchRepo.set("match-lazy-1", archivedNimWin);

    response = await supertest(app).get("/api/puzzle/nim");

    expect(response.status).toBe(200);
    expect(response.body.gameKey).toBe("nim");
    expect(response.body.date).toBe(today());
    // hydrated per-game position, not a {matchId, upToMoveIndex} reference
    expect(response.body.position).toStrictEqual({ remaining: 2, nextPlayer: 1 });
    // and even a lazily generated puzzle never leaks its solution
    expect(response.body).not.toHaveProperty("solution");

    // the generated record is stored: a second GET serves the same puzzle
    const again = await supertest(app).get("/api/puzzle/nim");
    expect(again.body).toStrictEqual(response.body);
  });

  it("lets a raw move solve the lazily generated puzzle end to end", async () => {
    await MatchRepo.set("match-lazy-1", archivedNimWin);
    const served = await supertest(app).get("/api/puzzle/nim");

    // the client echoes the served date back on the attempt
    response = await supertest(app)
      .post("/api/puzzle/nim/attempt")
      .send({ auth: auth1, payload: { move: 1, timeMs: 900, date: served.body.date } });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("still returns 404 when the archive has no suitable match", async () => {
    response = await supertest(app).get("/api/puzzle/nim");
    expect(response.status).toBe(404);
  });
});
