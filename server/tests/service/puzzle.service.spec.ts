import { beforeEach, describe, expect, it } from "vitest";
import { dailyPuzzleKey, type MatchRecord } from "../../src/models.ts";
import { MatchRepo, PuzzleAttemptRepo, PuzzleRepo, UserRepo } from "../../src/repository.ts";
import { getUserByUsername } from "../../src/services/auth.service.ts";
import {
  generatePuzzleForGame,
  getOrGenerateTodaysPuzzle,
  submitAttempt,
} from "../../src/services/puzzle.service.ts";

/* ---------------------------------------------------------------------------
 * Match fixtures
 *
 * The generator mines the most recent archived win with enough moves, folds
 * the early moves through the real game logic to a hydrated per-game
 * position (a watcher view — never hidden info like guess's secret), and
 * keeps the last moves as the solution, encoded as RAW move payloads (the
 * shape the attempt endpoint compares against), never MatchMove envelopes.
 * ------------------------------------------------------------------------- */

const P1 = { id: "u-p1", type: "human" as const, displayName: "Player One" };
const P2 = { id: "u-p2", type: "human" as const, displayName: "Player Two" };

/** A finished 7-move misère nim game: both players always take 3, P2 wins. */
function nimWin(overrides: Partial<MatchRecord> = {}): MatchRecord {
  const actors = [P1, P2];
  return {
    gameId: "game-nim-1",
    gameKey: "nim",
    rated: true,
    participants: [P1, P2],
    moves: Array.from({ length: 7 }).map((_, i) => ({
      actor: actors[i % 2].id,
      move: 3,
      timestamp: `2026-06-09T00:0${i}:00.000Z`,
    })),
    result: { outcome: "win", winnerId: P2.id },
    initialState: { remaining: 21, nextPlayer: 0 },
    createdAt: "2026-06-09T00:10:00.000Z",
    completedAt: "2026-06-09T00:10:00.000Z",
    ...overrides,
  };
}

/** A finished 4-player guess game. Secret 40; the last guess (41) wins. */
function guessWin(): MatchRecord {
  const players = ["u-g0", "u-g1", "u-g2", "u-g3"];
  const guesses = [10, 55, 80, 41];
  return {
    gameId: "game-guess-1",
    gameKey: "guess",
    rated: false,
    participants: players.map((id, i) => ({
      id,
      type: "human",
      displayName: `Guesser ${i}`,
    })),
    moves: guesses.map((guess, i) => ({
      actor: players[i],
      move: guess,
      timestamp: `2026-06-09T01:0${i}:00.000Z`,
    })),
    result: { outcome: "win", winnerId: "u-g3" },
    initialState: { secret: 40, guesses: [null, null, null, null] },
    createdAt: "2026-06-09T01:10:00.000Z",
    completedAt: "2026-06-09T01:10:00.000Z",
  };
}

const today = new Date();

beforeEach(async () => {
  // The global setup clears MatchRepo but not PuzzleRepo (the daily key is
  // deterministic, so stale puzzles would otherwise leak between tests here).
  await PuzzleRepo.clear();
});

describe("generatePuzzleForGame (nim)", () => {
  it("hydrates the position by folding the early moves through the game logic", async () => {
    await MatchRepo.set("match-nim-1", nimWin());

    const puzzle = await generatePuzzleForGame("nim", today);

    // 7 moves - 2 solution moves = 5 folded moves of take-3 → 6 tokens left,
    // and it is P2's (index 1) turn — the winner about to clinch.
    expect(puzzle).not.toBeNull();
    expect(puzzle!.position).toStrictEqual({ remaining: 6, nextPlayer: 1 });
    expect(puzzle!.sourceMatchId).toBe("match-nim-1");
  });

  it("encodes the solution as raw move payloads, not MatchMove envelopes", async () => {
    await MatchRepo.set("match-nim-1", nimWin());

    const puzzle = await generatePuzzleForGame("nim", today);

    expect(puzzle!.solution.moves).toStrictEqual([3, 3]);
  });

  it("writes a short human explanation alongside the solution", async () => {
    await MatchRepo.set("match-nim-1", nimWin());

    const puzzle = await generatePuzzleForGame("nim", today);

    expect(typeof puzzle!.solution.explanation).toBe("string");
    expect(puzzle!.solution.explanation!.length).toBeGreaterThan(0);
  });

  it("is idempotent — a second call returns the stored puzzle untouched", async () => {
    await MatchRepo.set("match-nim-1", nimWin());

    const first = await generatePuzzleForGame("nim", today);
    const second = await generatePuzzleForGame("nim", today);

    expect(second).toStrictEqual(first);
  });

  it("returns null when no archived match qualifies", async () => {
    // a loss-less archive: too few moves / draws / wrong game never qualify
    await MatchRepo.set(
      "match-short",
      nimWin({
        moves: nimWin().moves.slice(0, 3),
      }),
    );
    await MatchRepo.set("match-draw", nimWin({ result: { outcome: "abandoned" } }));

    expect(await generatePuzzleForGame("nim", today)).toBeNull();
  });

  it("skips a corrupt archive entry and falls back to an older valid win", async () => {
    const valid = nimWin();
    // Most recent candidate is corrupt: its first move is by the wrong
    // player, so the game logic rejects the fold.
    const corrupt = nimWin({
      moves: nimWin().moves.map((m, i) => (i === 0 ? { ...m, actor: P2.id } : m)),
      completedAt: "2026-06-09T09:00:00.000Z",
    });
    await MatchRepo.set("match-valid", valid);
    await MatchRepo.set("match-corrupt", corrupt);

    const puzzle = await generatePuzzleForGame("nim", today);

    expect(puzzle).not.toBeNull();
    expect(puzzle!.sourceMatchId).toBe("match-valid");
  });
});

describe("generatePuzzleForGame (guess)", () => {
  it("hydrates a watcher view of the position that never includes the secret", async () => {
    await MatchRepo.set("match-guess-1", guessWin());

    const puzzle = await generatePuzzleForGame("guess", today);

    // 4 moves - 2 solution moves = the first 2 guesses are already in.
    expect(puzzle!.position).toStrictEqual({
      finished: false,
      guesses: [true, true, false, false],
    });
    expect(puzzle!.solution.moves).toStrictEqual([80, 41]);
  });
});

describe("getOrGenerateTodaysPuzzle", () => {
  it("generates today's puzzle on first request when the cron has not run", async () => {
    await MatchRepo.set("match-nim-1", nimWin());

    const puzzle = await getOrGenerateTodaysPuzzle("nim");

    expect(puzzle).not.toBeNull();
    expect(puzzle!.date).toBe(today.toISOString().slice(0, 10));
    expect(await PuzzleRepo.find(dailyPuzzleKey({ gameKey: "nim", date: today }))).not.toBeNull();
  });

  it("returns the existing puzzle without regenerating when one is stored", async () => {
    const key = dailyPuzzleKey({ gameKey: "nim", date: today });
    const seeded = {
      gameKey: "nim" as const,
      date: today.toISOString().slice(0, 10),
      position: { remaining: 4, nextPlayer: 1 },
      solution: { moves: [3], explanation: "seeded by test" },
      createdAt: new Date().toISOString(),
    };
    await PuzzleRepo.set(key, seeded);
    await MatchRepo.set("match-nim-1", nimWin());

    const puzzle = await getOrGenerateTodaysPuzzle("nim");

    expect(puzzle).toStrictEqual(seeded);
  });

  it("still returns null when the archive has nothing to mine", async () => {
    expect(await getOrGenerateTodaysPuzzle("nim")).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * Daily rated-attempt economy (submitAttempt)
 *
 * Attempts are unlimited and the hint reveals the grading key, so rating must
 * be gated server-side: only the FIRST UNHINTED attempt of the UTC day per
 * (user, game) is rated. Everything else is practice — still graded honestly,
 * but eloDelta 0 and rating/streak frozen, flagged `rated: false`.
 * ------------------------------------------------------------------------- */

describe("submitAttempt: daily rated-attempt economy", () => {
  const todayIso = today.toISOString().slice(0, 10);

  /** Seed today's nim puzzle with a known winning move to grade against. */
  async function seedNimPuzzle(winningMove: number): Promise<void> {
    await PuzzleRepo.set(dailyPuzzleKey({ gameKey: "nim", date: today }), {
      gameKey: "nim",
      date: todayIso,
      position: { remaining: 4, nextPlayer: 1 },
      solution: { moves: [winningMove], explanation: "seeded by test" },
      createdAt: new Date().toISOString(),
    });
  }

  /** The seeded default user — recreated fresh by the global test setup. */
  async function user1Id(): Promise<string> {
    return (await getUserByUsername("user1"))!.userId;
  }

  it("returns null when there is no puzzle for today", async () => {
    const outcome = await submitAttempt("nim", await user1Id(), {
      move: 3,
      timeMs: 500,
      hintsUsed: 0,
    });
    expect(outcome).toBeNull();
  });

  it("rates the first unhinted attempt of the day and persists rating + streak", async () => {
    await seedNimPuzzle(3);
    const userId = await user1Id();
    const before = await UserRepo.get(userId);

    const outcome = await submitAttempt("nim", userId, { move: 3, timeMs: 900, hintsUsed: 0 });

    expect(outcome).not.toBeNull();
    expect(outcome!.rated).toBe(true);
    expect(outcome!.success).toBe(true);
    expect(outcome!.eloDelta).toBeGreaterThan(0);
    expect(outcome!.newRating.rating).toBeGreaterThan(before.puzzleRating.rating);
    expect(outcome!.streak).toStrictEqual({ current: 1, best: 1, lastSolvedAt: todayIso });

    const after = await UserRepo.get(userId);
    expect(after.puzzleRating).toStrictEqual(outcome!.newRating);
    expect(after.puzzleStreak).toStrictEqual(outcome!.streak);
  });

  it("treats the second attempt of the day as practice: graded, but rating and streak frozen", async () => {
    await seedNimPuzzle(3);
    const userId = await user1Id();

    // The first (rated) attempt fails — today's rated slot is now spent.
    const first = await submitAttempt("nim", userId, { move: 1, timeMs: 700, hintsUsed: 0 });
    expect(first!.rated).toBe(true);
    expect(first!.eloDelta).toBeLessThan(0);
    const afterFirst = await UserRepo.get(userId);

    // The retry finds the right move but cannot farm the rating back.
    const second = await submitAttempt("nim", userId, { move: 3, timeMs: 400, hintsUsed: 0 });
    expect(second!.rated).toBe(false);
    expect(second!.success).toBe(true); // still graded honestly
    expect(second!.eloDelta).toBe(0);
    expect(second!.newRating).toStrictEqual(afterFirst.puzzleRating);
    expect(second!.streak).toStrictEqual(afterFirst.puzzleStreak);

    const afterSecond = await UserRepo.get(userId);
    expect(afterSecond.puzzleRating).toStrictEqual(afterFirst.puzzleRating);
    expect(afterSecond.puzzleStreak).toStrictEqual(afterFirst.puzzleStreak);
  });

  it("treats a hinted attempt as practice — the hint reveals the answer, so rating never moves", async () => {
    await seedNimPuzzle(3);
    const userId = await user1Id();
    const before = await UserRepo.get(userId);

    const outcome = await submitAttempt("nim", userId, { move: 3, timeMs: 300, hintsUsed: 1 });

    expect(outcome!.success).toBe(true);
    expect(outcome!.rated).toBe(false);
    expect(outcome!.eloDelta).toBe(0);
    expect(outcome!.newRating).toStrictEqual(before.puzzleRating);

    const after = await UserRepo.get(userId);
    expect(after.puzzleRating).toStrictEqual(before.puzzleRating);
    expect(after.puzzleStreak).toStrictEqual(before.puzzleStreak);
  });

  it("a hinted attempt does not spend the day's rated slot — the first UNHINTED attempt is the rated one", async () => {
    await seedNimPuzzle(3);
    const userId = await user1Id();

    const hinted = await submitAttempt("nim", userId, { move: 3, timeMs: 300, hintsUsed: 1 });
    expect(hinted!.rated).toBe(false);

    const unhinted = await submitAttempt("nim", userId, { move: 3, timeMs: 800, hintsUsed: 0 });
    expect(unhinted!.rated).toBe(true);
    expect(unhinted!.eloDelta).toBeGreaterThan(0);
  });

  it("logs practice attempts too, with a zero eloDelta", async () => {
    await seedNimPuzzle(3);
    const userId = await user1Id();

    await submitAttempt("nim", userId, { move: 3, timeMs: 300, hintsUsed: 1 });

    const attempts = await PuzzleAttemptRepo.getMany(await PuzzleAttemptRepo.getAllKeys());
    expect(attempts).toContainEqual(
      expect.objectContaining({
        puzzleId: dailyPuzzleKey({ gameKey: "nim", date: today }),
        attemptedBy: { id: userId, type: "human" },
        success: true,
        hintsUsed: 1,
        eloDelta: 0,
      }),
    );
  });
});
