import { beforeEach, describe, expect, it } from "vitest";
import { HINT_PENALTY } from "@gamenite/shared";
import { dailyPuzzleKey, puzzleHintKey, type MatchRecord } from "../../src/models.ts";
import {
  MatchRepo,
  PuzzleAttemptRepo,
  PuzzleHintRepo,
  PuzzleRepo,
  UserRepo,
} from "../../src/repository.ts";
import { getUserByUsername } from "../../src/services/auth.service.ts";
import {
  DEFAULT_RATING,
  DEFAULT_RD,
  DEFAULT_VOLATILITY,
} from "../../src/services/glicko2.service.ts";
import {
  generatePuzzleForGame,
  getOrGenerateTodaysPuzzle,
  getTrainingPack,
  grantHint,
  submitAttempt,
  submitTrainingAttempt,
} from "../../src/services/puzzle.service.ts";

/* ---------------------------------------------------------------------------
 * Match fixtures
 *
 * The generator mines the most recent archived win with enough moves, folds
 * the early moves through the real game logic to a hydrated per-game
 * position (a watcher view — never hidden info like guess's secret), and
 * keeps the last moves as the solution, encoded as RAW move payloads (the
 * shape the attempt endpoint grades), never MatchMove envelopes.
 *
 * Mining is now SOUND: a candidate is rejected unless the archived split
 * move passes the game's isWinningMove hook (nim: leaves remaining ≡ 1 mod 4).
 * ------------------------------------------------------------------------- */

const P1 = { id: "u-p1", type: "human" as const, displayName: "Player One" };
const P2 = { id: "u-p2", type: "human" as const, displayName: "Player Two" };

/**
 * A SOUND 11-move misère nim win: P1 always takes 3, P2 replies 1 — every P2
 * move leaves remaining ≡ 1 (mod 4), so P2's split move (take 1 from 2) is
 * genuinely winning. P1 takes the last token and loses.
 */
function soundNimWin(overrides: Partial<MatchRecord> = {}): MatchRecord {
  const takes = [3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 1];
  const actors = [P1, P2];
  return {
    gameId: "game-nim-sound",
    gameKey: "nim",
    rated: true,
    participants: [P1, P2],
    moves: takes.map((take, i) => ({
      actor: actors[i % 2].id,
      move: take,
      timestamp: `2026-06-09T00:${String(i).padStart(2, "0")}:00.000Z`,
    })),
    result: { outcome: "win", winnerId: P2.id },
    initialState: { remaining: 21, nextPlayer: 0 },
    createdAt: "2026-06-09T00:30:00.000Z",
    completedAt: "2026-06-09T00:30:00.000Z",
    ...overrides,
  };
}

/**
 * The classic UNSOUND archive entry: both players always take 3 from 21, so
 * the "winner" blundered at the split (taking 3 from 6 leaves 3 — not ≡ 1
 * mod 4) and only won because the opponent blundered right back.
 */
function blunderNimWin(overrides: Partial<MatchRecord> = {}): MatchRecord {
  const actors = [P1, P2];
  return {
    gameId: "game-nim-blunder",
    gameKey: "nim",
    rated: true,
    participants: [P1, P2],
    moves: Array.from({ length: 7 }).map((_, i) => ({
      actor: actors[i % 2].id,
      move: 3,
      timestamp: `2026-06-09T01:0${i}:00.000Z`,
    })),
    result: { outcome: "win", winnerId: P2.id },
    initialState: { remaining: 21, nextPlayer: 0 },
    createdAt: "2026-06-09T01:10:00.000Z",
    completedAt: "2026-06-09T01:10:00.000Z",
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

// Fixed puzzle days for the date-pinned attempt/hint/streak tests. Everything
// keys off the payload date, so these never need to be the real "today".
const D1 = "2026-06-10";
const D2 = "2026-06-11"; // the day after D1
const D4 = "2026-06-14"; // three days after D2 — breaks any chain

// Anchor the service clock to the payload's own date so every fixed-date
// call counts as a same-day attempt (the server only accepts today's or
// yesterday's puzzle). Tests that exercise the date-window guard call
// submitAttempt/grantHint directly with an explicit `now` instead.
const asNow = (ymd: string): Date => new Date(`${ymd}T12:00:00.000Z`);
const submit = (
  userId: string,
  gameKey: Parameters<typeof submitAttempt>[1],
  input: Parameters<typeof submitAttempt>[2],
) => submitAttempt(userId, gameKey, input, asNow(input.date));
const hint = (userId: string, gameKey: Parameters<typeof grantHint>[1], date: string) =>
  grantHint(userId, gameKey, date, asNow(date));

/** Seed a nim puzzle for one fixed day with a known position + archived solution. */
async function seedNimPuzzle(
  date: string,
  position: { remaining: number; nextPlayer: number },
  solutionMoves: number[],
): Promise<void> {
  await PuzzleRepo.set(`nim:${date}`, {
    gameKey: "nim",
    date,
    position,
    solution: { moves: solutionMoves, explanation: "seeded by test" },
    createdAt: new Date().toISOString(),
  });
}

/** The seeded default user — recreated fresh by the global test setup. */
async function user1Id(): Promise<string> {
  return (await getUserByUsername("user1"))!.userId;
}

beforeEach(async () => {
  // The global setup clears MatchRepo but not the puzzle repos (the daily key
  // is deterministic, so stale records would otherwise leak between tests).
  await PuzzleRepo.clear();
  await PuzzleAttemptRepo.clear();
  await PuzzleHintRepo.clear();
});

describe("generatePuzzleForGame (nim)", () => {
  it("hydrates the position by folding the early moves through the game logic", async () => {
    await MatchRepo.set("match-nim-1", soundNimWin());

    const puzzle = await generatePuzzleForGame("nim", today);

    // 11 moves - 2 solution moves = 9 folded moves (21 - 19 taken = 2 left),
    // and it is P2's (index 1) turn — the winner about to clinch.
    expect(puzzle).not.toBeNull();
    expect(puzzle!.position).toStrictEqual({ remaining: 2, nextPlayer: 1 });
    expect(puzzle!.sourceMatchId).toBe("match-nim-1");
  });

  it("encodes the solution as raw move payloads, not MatchMove envelopes", async () => {
    await MatchRepo.set("match-nim-1", soundNimWin());

    const puzzle = await generatePuzzleForGame("nim", today);

    expect(puzzle!.solution.moves).toStrictEqual([1, 1]);
  });

  it("writes a short human explanation alongside the solution", async () => {
    await MatchRepo.set("match-nim-1", soundNimWin());

    const puzzle = await generatePuzzleForGame("nim", today);

    expect(typeof puzzle!.solution.explanation).toBe("string");
    expect(puzzle!.solution.explanation!.length).toBeGreaterThan(0);
  });

  it("is idempotent — a second call returns the stored puzzle untouched", async () => {
    await MatchRepo.set("match-nim-1", soundNimWin());

    const first = await generatePuzzleForGame("nim", today);
    const second = await generatePuzzleForGame("nim", today);

    expect(second).toStrictEqual(first);
  });

  it("returns null when no archived match qualifies", async () => {
    // a win-less archive: too few moves / abandoned games never qualify
    await MatchRepo.set(
      "match-short",
      soundNimWin({
        moves: soundNimWin().moves.slice(0, 3),
      }),
    );
    await MatchRepo.set("match-draw", soundNimWin({ result: { outcome: "abandoned" } }));

    expect(await generatePuzzleForGame("nim", today)).toBeNull();
  });

  it("skips a corrupt archive entry and falls back to an older valid win", async () => {
    const valid = soundNimWin();
    // Most recent candidate is corrupt: its first move is by the wrong
    // player, so the game logic rejects the fold.
    const corrupt = soundNimWin({
      moves: soundNimWin().moves.map((m, i) => (i === 0 ? { ...m, actor: P2.id } : m)),
      completedAt: "2026-06-09T09:00:00.000Z",
    });
    await MatchRepo.set("match-valid", valid);
    await MatchRepo.set("match-corrupt", corrupt);

    const puzzle = await generatePuzzleForGame("nim", today);

    expect(puzzle).not.toBeNull();
    expect(puzzle!.sourceMatchId).toBe("match-valid");
  });

  it("refuses to mine a match whose winner blundered at the split", async () => {
    // The 7×take-3-from-21 line: the split move (take 3 from 6) leaves 3,
    // which is NOT ≡ 1 (mod 4) — the archived "solution" loses to best play.
    await MatchRepo.set("match-blunder", blunderNimWin());

    expect(await generatePuzzleForGame("nim", today)).toBeNull();
  });

  it("skips a blundered split and mines an older sound match instead", async () => {
    await MatchRepo.set("match-sound", soundNimWin());
    await MatchRepo.set(
      "match-blunder",
      blunderNimWin({ completedAt: "2026-06-09T09:00:00.000Z" }),
    );

    const puzzle = await generatePuzzleForGame("nim", today);

    expect(puzzle).not.toBeNull();
    expect(puzzle!.sourceMatchId).toBe("match-sound");
  });
});

describe("PUZZLE_GAME_KEYS: only deducible games get daily puzzles", () => {
  // Guess's watcher view shows only WHO guessed, never the values, so its
  // "puzzle" can only be solved via the leaked answer — it must never serve.

  it("does not generate a guess puzzle even when a guess win is archived", async () => {
    await MatchRepo.set("match-guess-1", guessWin());

    expect(await generatePuzzleForGame("guess", today)).toBeNull();
    expect(await getOrGenerateTodaysPuzzle("guess")).toBeNull();
  });

  it("never serves, grades, or hints against a stale stored guess puzzle", async () => {
    // a record left over from before the restriction (or a hand-seeded one)
    const date = today.toISOString().slice(0, 10);
    await PuzzleRepo.set(dailyPuzzleKey({ gameKey: "guess", date: today }), {
      gameKey: "guess",
      date,
      position: { finished: false, guesses: [true, true, false, false] },
      solution: { moves: [41], explanation: "seeded by test" },
      createdAt: new Date().toISOString(),
    });

    expect(await getOrGenerateTodaysPuzzle("guess")).toBeNull();

    const userId = await user1Id();
    expect(await submit(userId, "guess", { move: 41, timeMs: 100, date })).toBeNull();
    expect(await hint(userId, "guess", date)).toBeNull();
  });
});

describe("getOrGenerateTodaysPuzzle", () => {
  it("generates today's puzzle on first request when the cron has not run", async () => {
    await MatchRepo.set("match-nim-1", soundNimWin());

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
      position: { remaining: 6, nextPlayer: 1 },
      solution: { moves: [1], explanation: "seeded by test" },
      createdAt: new Date().toISOString(),
    };
    await PuzzleRepo.set(key, seeded);
    await MatchRepo.set("match-nim-1", soundNimWin());

    const puzzle = await getOrGenerateTodaysPuzzle("nim");

    expect(puzzle).toStrictEqual(seeded);
  });

  it("still returns null when the archive has nothing to mine", async () => {
    expect(await getOrGenerateTodaysPuzzle("nim")).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * Grading (submitAttempt)
 *
 * success comes from the game's isWinningMove hook, NOT string equality with
 * the archived line: the puzzle is complete (any winning move scores) and
 * sound (an archived blunder can never be the grading key). Exact JSON
 * equality with solution.moves[0] is only a fallback for hookless games.
 * ------------------------------------------------------------------------- */

describe("submitAttempt: grading through isWinningMove", () => {
  it("grades {remaining: 6} with archived take-1: take 1 succeeds, take 3 fails", async () => {
    await seedNimPuzzle(D1, { remaining: 6, nextPlayer: 1 }, [1]);
    const userId = await user1Id();

    const win = await submit(userId, "nim", { move: 1, timeMs: 500, date: D1 });
    expect(win!.success).toBe(true);

    const loss = await submit(userId, "nim", { move: 3, timeMs: 500, date: D1 });
    expect(loss!.success).toBe(false);
  });

  it("accepts any winning move and rejects a blundered archived solution", async () => {
    // Archived solution says take 3 — a blunder from 6. The hook, not the
    // archive, is the grading key: 1 (the real winning move) succeeds and 3
    // fails even though it matches solution.moves[0] exactly.
    await seedNimPuzzle(D1, { remaining: 6, nextPlayer: 1 }, [3]);
    const userId = await user1Id();

    const win = await submit(userId, "nim", { move: 1, timeMs: 500, date: D1 });
    expect(win!.success).toBe(true);

    const loss = await submit(userId, "nim", { move: 3, timeMs: 500, date: D1 });
    expect(loss!.success).toBe(false);
  });

  it("reveals the archived solution move and explanation on the attempt response", async () => {
    await seedNimPuzzle(D1, { remaining: 6, nextPlayer: 1 }, [1]);

    const outcome = await submit(await user1Id(), "nim", {
      move: 3,
      timeMs: 500,
      date: D1,
    });

    expect(outcome!.solutionMove).toBe(1);
    expect(outcome!.explanation).toBe("seeded by test");
  });
});

/* ---------------------------------------------------------------------------
 * Date pinning
 *
 * The payload's date (what the client actually rendered) pins the puzzle
 * graded against, the rated slot, the streak day, and the attempt log.
 * The service never re-derives "today" for an attempt.
 * ------------------------------------------------------------------------- */

describe("submitAttempt: date pinning", () => {
  it("returns null when there is no puzzle stored for the payload's date", async () => {
    await seedNimPuzzle(D1, { remaining: 6, nextPlayer: 1 }, [1]);

    expect(await submit(await user1Id(), "nim", { move: 1, timeMs: 500, date: D2 })).toBe(null);
  });

  it("refuses dates older than yesterday — closes the backfill-a-streak hole", async () => {
    // The puzzle EXISTS for D1, but D1 is three days before the clock (D4),
    // so a crafted attempt that backfills it is rejected outright.
    await seedNimPuzzle(D1, { remaining: 6, nextPlayer: 1 }, [1]);
    const userId = await user1Id();

    const backfilled = await submitAttempt(
      userId,
      "nim",
      { move: 1, timeMs: 500, date: D1 },
      asNow(D4),
    );
    expect(backfilled).toBeNull();
    // Nothing was logged, rated, or streaked off the rejected attempt.
    expect(await PuzzleAttemptRepo.getAllKeys()).toHaveLength(0);
    expect((await UserRepo.get(userId)).puzzleStreak).toStrictEqual({ current: 0, best: 0 });

    // Yesterday (the midnight-straddle grace) is still accepted.
    await seedNimPuzzle(D2, { remaining: 6, nextPlayer: 1 }, [1]);
    const straddle = await submitAttempt(
      userId,
      "nim",
      { move: 1, timeMs: 500, date: D1 },
      asNow(D2),
    );
    expect(straddle).not.toBeNull();
  });

  it("refuses a future-dated attempt", async () => {
    await seedNimPuzzle(D4, { remaining: 6, nextPlayer: 1 }, [1]);
    const ahead = await submitAttempt(
      await user1Id(),
      "nim",
      { move: 1, timeMs: 500, date: D4 },
      asNow(D1),
    );
    expect(ahead).toBeNull();
  });

  it("logs the attempt under the pinned puzzle-date, not the wall clock", async () => {
    await seedNimPuzzle(D1, { remaining: 6, nextPlayer: 1 }, [1]);
    const userId = await user1Id();

    await submit(userId, "nim", { move: 1, timeMs: 500, date: D1 });

    const attempts = await PuzzleAttemptRepo.getMany(await PuzzleAttemptRepo.getAllKeys());
    expect(attempts).toContainEqual(
      expect.objectContaining({
        puzzleId: `nim:${D1}`,
        attemptedBy: { id: userId, type: "human" },
      }),
    );
  });

  it("keys the rated slot to the puzzle-date, so each day's puzzle gets its own slot", async () => {
    await seedNimPuzzle(D1, { remaining: 6, nextPlayer: 1 }, [1]);
    await seedNimPuzzle(D2, { remaining: 6, nextPlayer: 1 }, [1]);
    const userId = await user1Id();

    const first = await submit(userId, "nim", { move: 1, timeMs: 500, date: D1 });
    expect(first!.rated).toBe(true);
    expect((await UserRepo.get(userId)).puzzleLastRatedAt?.nim).toBe(D1);

    // D1's slot is spent, but D2 is a different puzzle-date: still rated.
    const second = await submit(userId, "nim", { move: 1, timeMs: 500, date: D2 });
    expect(second!.rated).toBe(true);
    expect((await UserRepo.get(userId)).puzzleLastRatedAt?.nim).toBe(D2);
  });
});

/* ---------------------------------------------------------------------------
 * Daily rated-attempt economy (submitAttempt)
 *
 * Attempts are unlimited and the hint reveals the answer, so rating is gated
 * server-side: only the FIRST UNHINTED attempt per (user, game, puzzle-date)
 * is rated. Everything else is practice — still graded honestly, but
 * eloDelta 0 and rating frozen, flagged `rated: false`.
 * ------------------------------------------------------------------------- */

describe("submitAttempt: daily rated-attempt economy", () => {
  it("rates the first unhinted attempt and persists rating + streak + slot", async () => {
    await seedNimPuzzle(D1, { remaining: 6, nextPlayer: 1 }, [1]);
    const userId = await user1Id();

    const outcome = await submit(userId, "nim", { move: 1, timeMs: 900, date: D1 });

    expect(outcome).not.toBeNull();
    expect(outcome!.rated).toBe(true);
    expect(outcome!.success).toBe(true);
    expect(outcome!.eloDelta).toBeGreaterThan(0);
    // first rated attempt starts from the 1500/350 default for this game
    expect(outcome!.newRating.rating).toBeGreaterThan(1500);
    expect(outcome!.newRating.rd).toBeLessThan(350);
    expect(outcome!.streak).toStrictEqual({ current: 1, best: 1, lastSolvedAt: D1 });

    const after = await UserRepo.get(userId);
    expect(after.puzzleRatings.nim).toStrictEqual(outcome!.newRating);
    expect(after.puzzleStreak).toStrictEqual({ current: 1, best: 1, lastSolvedAt: D1 });
    expect(after.puzzleLastRatedAt?.nim).toBe(D1);
  });

  it("treats later attempts on the same puzzle-date as practice: graded, echoed, unrated", async () => {
    await seedNimPuzzle(D1, { remaining: 6, nextPlayer: 1 }, [1]);
    const userId = await user1Id();

    const first = await submit(userId, "nim", { move: 1, timeMs: 700, date: D1 });
    expect(first!.rated).toBe(true);
    const afterFirst = await UserRepo.get(userId);

    // The retry is still graded honestly but cannot farm rating.
    const second = await submit(userId, "nim", { move: 1, timeMs: 400, date: D1 });
    expect(second!.rated).toBe(false);
    expect(second!.success).toBe(true);
    expect(second!.eloDelta).toBe(0);
    expect(second!.newRating).toStrictEqual(afterFirst.puzzleRatings.nim);

    const afterSecond = await UserRepo.get(userId);
    expect(afterSecond.puzzleRatings.nim).toStrictEqual(afterFirst.puzzleRatings.nim);
    expect(afterSecond.puzzleStreak).toStrictEqual(afterFirst.puzzleStreak);
  });

  it("updates the PER-GAME rating relative to that game's current value", async () => {
    await seedNimPuzzle(D1, { remaining: 6, nextPlayer: 1 }, [1]);
    const userId = await user1Id();
    const userRecord = await UserRepo.get(userId);
    await UserRepo.set(userId, {
      ...userRecord,
      puzzleRatings: {
        nim: { rating: 1610, rd: 120, vol: 0.06 },
        guess: { rating: 1700, rd: 80, vol: 0.06 },
      },
    });

    const outcome = await submit(userId, "nim", { move: 1, timeMs: 500, date: D1 });

    expect(outcome!.rated).toBe(true);
    expect(outcome!.newRating.rating).toBeGreaterThan(1610);
    expect(outcome!.eloDelta).toBe(Math.round(outcome!.newRating.rating - 1610));

    const after = await UserRepo.get(userId);
    expect(after.puzzleRatings.nim).toStrictEqual(outcome!.newRating);
    // the other game's rating is untouched
    expect(after.puzzleRatings.guess).toStrictEqual({ rating: 1700, rd: 80, vol: 0.06 });
  });

  it("logs every attempt with the rated flag and server-derived hintsUsed", async () => {
    await seedNimPuzzle(D1, { remaining: 6, nextPlayer: 1 }, [1]);
    const userId = await user1Id();

    await submit(userId, "nim", { move: 1, timeMs: 900, date: D1 });
    await hint(userId, "nim", D1);
    await submit(userId, "nim", { move: 1, timeMs: 200, date: D1 });

    const attempts = await PuzzleAttemptRepo.getMany(await PuzzleAttemptRepo.getAllKeys());
    expect(attempts).toContainEqual(
      expect.objectContaining({
        puzzleId: `nim:${D1}`,
        success: true,
        rated: true,
        hintsUsed: 0,
        timeMs: 900,
      }),
    );
    expect(attempts).toContainEqual(
      expect.objectContaining({
        puzzleId: `nim:${D1}`,
        success: true,
        rated: false,
        hintsUsed: 1,
        eloDelta: 0,
        timeMs: 200,
      }),
    );
  });
});

/* ---------------------------------------------------------------------------
 * Streak — DECOUPLED from the rated slot
 *
 * The streak advances on the first unhinted SUCCESSFUL solve of a
 * puzzle-date, regardless of whether that attempt was rated. A failed rated
 * attempt spends the slot but must never lock the streak out for the day.
 * ------------------------------------------------------------------------- */

describe("submitAttempt: streak decoupled from the rated slot", () => {
  it("HEADLINE BUG: a later genuine solve still advances the streak after a failed rated attempt", async () => {
    await seedNimPuzzle(D1, { remaining: 6, nextPlayer: 1 }, [1]);
    const userId = await user1Id();

    // First unhinted attempt fails: slot spent, rating drops, no streak.
    const first = await submit(userId, "nim", { move: 3, timeMs: 700, date: D1 });
    expect(first!.rated).toBe(true);
    expect(first!.success).toBe(false);
    expect(first!.eloDelta).toBeLessThan(0);
    expect(first!.streak.current).toBe(0);

    // The second attempt solves it: unrated, but the streak MUST advance.
    const second = await submit(userId, "nim", { move: 1, timeMs: 400, date: D1 });
    expect(second!.rated).toBe(false);
    expect(second!.eloDelta).toBe(0);
    expect(second!.streak).toStrictEqual({ current: 1, best: 1, lastSolvedAt: D1 });

    const after = await UserRepo.get(userId);
    expect(after.puzzleStreak).toStrictEqual({ current: 1, best: 1, lastSolvedAt: D1 });
    // rating still reflects only the failed rated attempt
    expect(after.puzzleRatings.nim).toStrictEqual(first!.newRating);
  });

  it("chains across consecutive puzzle-dates", async () => {
    await seedNimPuzzle(D1, { remaining: 6, nextPlayer: 1 }, [1]);
    await seedNimPuzzle(D2, { remaining: 6, nextPlayer: 1 }, [1]);
    const userId = await user1Id();

    const first = await submit(userId, "nim", { move: 1, timeMs: 500, date: D1 });
    expect(first!.streak).toStrictEqual({ current: 1, best: 1, lastSolvedAt: D1 });

    const second = await submit(userId, "nim", { move: 1, timeMs: 500, date: D2 });
    expect(second!.streak).toStrictEqual({ current: 2, best: 2, lastSolvedAt: D2 });
  });

  it("resets to 1 after a gap while the historical best survives", async () => {
    await seedNimPuzzle(D1, { remaining: 6, nextPlayer: 1 }, [1]);
    await seedNimPuzzle(D4, { remaining: 6, nextPlayer: 1 }, [1]);
    const userId = await user1Id();
    const userRecord = await UserRepo.get(userId);
    await UserRepo.set(userId, { ...userRecord, puzzleStreak: { current: 0, best: 7 } });

    const first = await submit(userId, "nim", { move: 1, timeMs: 500, date: D1 });
    expect(first!.streak).toStrictEqual({ current: 1, best: 7, lastSolvedAt: D1 });

    // D4 is three days later — the chain broke, so the solve restarts at 1.
    const second = await submit(userId, "nim", { move: 1, timeMs: 500, date: D4 });
    expect(second!.streak).toStrictEqual({ current: 1, best: 7, lastSolvedAt: D4 });
  });

  it("does not advance again on a second solve of the same puzzle-date", async () => {
    await seedNimPuzzle(D1, { remaining: 6, nextPlayer: 1 }, [1]);
    const userId = await user1Id();

    await submit(userId, "nim", { move: 1, timeMs: 500, date: D1 });
    const again = await submit(userId, "nim", { move: 1, timeMs: 500, date: D1 });

    expect(again!.streak).toStrictEqual({ current: 1, best: 1, lastSolvedAt: D1 });
    expect((await UserRepo.get(userId)).puzzleStreak).toStrictEqual({
      current: 1,
      best: 1,
      lastSolvedAt: D1,
    });
  });

  it("never regresses lastSolvedAt when an older date's puzzle is solved later", async () => {
    await seedNimPuzzle(D1, { remaining: 6, nextPlayer: 1 }, [1]);
    await seedNimPuzzle(D2, { remaining: 6, nextPlayer: 1 }, [1]);
    const userId = await user1Id();

    await submit(userId, "nim", { move: 1, timeMs: 500, date: D2 });
    await submit(userId, "nim", { move: 1, timeMs: 500, date: D1 });

    expect((await UserRepo.get(userId)).puzzleStreak).toStrictEqual({
      current: 1,
      best: 1,
      lastSolvedAt: D2,
    });
  });

  it("hinted solves never advance the streak", async () => {
    await seedNimPuzzle(D1, { remaining: 6, nextPlayer: 1 }, [1]);
    const userId = await user1Id();

    await hint(userId, "nim", D1);
    const outcome = await submit(userId, "nim", { move: 1, timeMs: 300, date: D1 });

    expect(outcome!.success).toBe(true);
    expect(outcome!.rated).toBe(false);
    expect(outcome!.eloDelta).toBe(0);
    expect(outcome!.streak.current).toBe(0);

    const after = await UserRepo.get(userId);
    expect(after.puzzleStreak).toStrictEqual({ current: 0, best: 0 });
    // the hint already docked the rating - the unrated attempt doesn't touch it again
    expect(after.puzzleRatings.nim).toStrictEqual({
      rating: DEFAULT_RATING - HINT_PENALTY,
      rd: DEFAULT_RD,
      vol: DEFAULT_VOLATILITY,
    });
    expect(after.puzzleLastRatedAt?.nim).toBeUndefined();
  });
});

describe("submitAttempt: served streaks go through effectiveStreak", () => {
  it("serves current 0 for a stale stored streak while best survives", async () => {
    await seedNimPuzzle(D4, { remaining: 6, nextPlayer: 1 }, [1]);
    const userId = await user1Id();
    const userRecord = await UserRepo.get(userId);
    // Last solve was D2 — three days before the D4 attempt: the chain is dead.
    await UserRepo.set(userId, {
      ...userRecord,
      puzzleStreak: { current: 5, best: 9, lastSolvedAt: D2 },
    });

    const outcome = await submit(userId, "nim", { move: 3, timeMs: 500, date: D4 });

    expect(outcome!.success).toBe(false);
    expect(outcome!.streak).toStrictEqual({ current: 0, best: 9, lastSolvedAt: D2 });

    // The stored record keeps its raw history; only the served value is derived.
    expect((await UserRepo.get(userId)).puzzleStreak).toStrictEqual({
      current: 5,
      best: 9,
      lastSolvedAt: D2,
    });
  });
});

/* ---------------------------------------------------------------------------
 * Server-side hints (grantHint)
 *
 * The GET never carries the solution; the hint endpoint reveals it, records
 * the grant in PuzzleHintRepo, and from then on every attempt by that user
 * on that puzzle is hinted: never rated, never streak-advancing.
 * ------------------------------------------------------------------------- */

describe("grantHint", () => {
  it("returns null when there is no puzzle for that game and date", async () => {
    expect(await hint(await user1Id(), "nim", D1)).toBeNull();
  });

  it("reveals the archived solution move, records the grant, and docks the rating", async () => {
    await seedNimPuzzle(D1, { remaining: 6, nextPlayer: 1 }, [1]);
    const userId = await user1Id();

    const result = await hint(userId, "nim", D1);

    expect(result).toStrictEqual({
      hintMove: 1,
      explanation: "seeded by test",
      eloDelta: -HINT_PENALTY,
      newRating: { rating: DEFAULT_RATING - HINT_PENALTY, rd: DEFAULT_RD, vol: DEFAULT_VOLATILITY },
    });
    const record = await PuzzleHintRepo.find(puzzleHintKey(userId, `nim:${D1}`));
    expect(record).toMatchObject({ userId, puzzleId: `nim:${D1}` });
    expect((await UserRepo.get(userId)).puzzleRatings.nim).toStrictEqual(result!.newRating);
  });

  it("is idempotent — a second grant keeps the original record and doesn't charge twice", async () => {
    await seedNimPuzzle(D1, { remaining: 6, nextPlayer: 1 }, [1]);
    const userId = await user1Id();

    const first = await hint(userId, "nim", D1);
    const recordAfterFirst = await PuzzleHintRepo.find(puzzleHintKey(userId, `nim:${D1}`));

    const second = await hint(userId, "nim", D1);
    const recordAfterSecond = await PuzzleHintRepo.find(puzzleHintKey(userId, `nim:${D1}`));

    expect(second).toStrictEqual(first);
    expect(recordAfterSecond).toStrictEqual(recordAfterFirst);
    expect(await PuzzleHintRepo.getAllKeys()).toHaveLength(1);
    expect((await UserRepo.get(userId)).puzzleRatings.nim?.rating).toBe(
      DEFAULT_RATING - HINT_PENALTY,
    );
  });

  it("poisons the rated slot for that puzzle: post-hint attempts never rate", async () => {
    await seedNimPuzzle(D1, { remaining: 6, nextPlayer: 1 }, [1]);
    const userId = await user1Id();

    await hint(userId, "nim", D1);

    const first = await submit(userId, "nim", { move: 1, timeMs: 300, date: D1 });
    const second = await submit(userId, "nim", { move: 1, timeMs: 300, date: D1 });

    expect(first!.rated).toBe(false);
    expect(second!.rated).toBe(false);
    // the hint already docked the rating — unrated attempts don't touch it further
    expect((await UserRepo.get(userId)).puzzleRatings.nim).toStrictEqual({
      rating: DEFAULT_RATING - HINT_PENALTY,
      rd: DEFAULT_RD,
      vol: DEFAULT_VOLATILITY,
    });
  });
});

/* ---------------------------------------------------------------------------
 * Training pack feed (getTrainingPack / submitTrainingAttempt)
 *
 * Extra unrated practice positions, mined from the same sound candidates as
 * the daily puzzle, but nothing gets stored: every call re-scans the archive
 * and grading re-derives the solution from sourceMatchId.
 * ------------------------------------------------------------------------- */

describe("getTrainingPack", () => {
  it("returns [] for a game outside PUZZLE_GAME_KEYS", async () => {
    await MatchRepo.set("match-guess-1", guessWin());

    expect(await getTrainingPack("guess", { limit: 5 })).toStrictEqual([]);
  });

  it("mines sound candidates from the archive, most-recent-first", async () => {
    await MatchRepo.set("match-old", soundNimWin({ completedAt: "2026-06-08T00:00:00.000Z" }));
    await MatchRepo.set("match-new", soundNimWin({ completedAt: "2026-06-09T00:00:00.000Z" }));

    const pack = await getTrainingPack("nim", { limit: 5 });

    expect(pack.map((entry) => entry.sourceMatchId)).toStrictEqual(["match-new", "match-old"]);
    expect(pack[0].gameKey).toBe("nim");
    expect(pack[0].position).toStrictEqual({ remaining: 2, nextPlayer: 1 });
  });

  it("excludes today's daily puzzle's source match automatically", async () => {
    await MatchRepo.set("match-nim-1", soundNimWin());
    await generatePuzzleForGame("nim", today);

    expect(await getTrainingPack("nim", { limit: 5 })).toStrictEqual([]);
  });

  it("excludes client-supplied match ids for load more", async () => {
    await MatchRepo.set("match-a", soundNimWin({ completedAt: "2026-06-08T00:00:00.000Z" }));
    await MatchRepo.set("match-b", soundNimWin({ completedAt: "2026-06-09T00:00:00.000Z" }));

    const pack = await getTrainingPack("nim", { limit: 5, exclude: ["match-b"] });

    expect(pack.map((entry) => entry.sourceMatchId)).toStrictEqual(["match-a"]);
  });

  it("caps results at limit", async () => {
    await MatchRepo.set("match-a", soundNimWin({ completedAt: "2026-06-07T00:00:00.000Z" }));
    await MatchRepo.set("match-b", soundNimWin({ completedAt: "2026-06-08T00:00:00.000Z" }));
    await MatchRepo.set("match-c", soundNimWin({ completedAt: "2026-06-09T00:00:00.000Z" }));

    expect(await getTrainingPack("nim", { limit: 2 })).toHaveLength(2);
  });
});

describe("submitTrainingAttempt", () => {
  it("grades a winning move as success and returns the archived solution", async () => {
    await MatchRepo.set("match-nim-1", soundNimWin());

    const result = await submitTrainingAttempt("nim", "match-nim-1", 1);

    expect(result!.success).toBe(true);
    expect(result!.solutionMove).toBe(1);
    expect(typeof result!.explanation).toBe("string");
  });

  it("grades a losing move as failure", async () => {
    await MatchRepo.set("match-nim-1", soundNimWin());

    const result = await submitTrainingAttempt("nim", "match-nim-1", 3);

    expect(result!.success).toBe(false);
  });

  it("returns null for an unknown sourceMatchId", async () => {
    expect(await submitTrainingAttempt("nim", "does-not-exist", 1)).toBeNull();
  });

  it("returns null when the match belongs to a different game", async () => {
    await MatchRepo.set("match-guess-1", guessWin());

    expect(await submitTrainingAttempt("nim", "match-guess-1", 1)).toBeNull();
  });

  it("never touches ratings, streaks, or the attempt log", async () => {
    await MatchRepo.set("match-nim-1", soundNimWin());
    const userId = await user1Id();
    const before = await UserRepo.get(userId);

    await submitTrainingAttempt("nim", "match-nim-1", 1);

    const after = await UserRepo.get(userId);
    expect(after.puzzleRatings).toStrictEqual(before.puzzleRatings);
    expect(after.puzzleStreak).toStrictEqual(before.puzzleStreak);
    expect(await PuzzleAttemptRepo.getAllKeys()).toHaveLength(0);
  });
});
