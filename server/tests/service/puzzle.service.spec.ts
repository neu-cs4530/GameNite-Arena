import { beforeEach, describe, expect, it } from "vitest";
import { dailyPuzzleKey, type MatchRecord } from "../../src/models.ts";
import { MatchRepo, PuzzleRepo } from "../../src/repository.ts";
import {
  generatePuzzleForGame,
  getOrGenerateTodaysPuzzle,
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
