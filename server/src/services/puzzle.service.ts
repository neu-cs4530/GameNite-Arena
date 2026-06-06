import type { GameKey } from "@gamenite/shared";
import { dailyPuzzleKey, type PuzzleRecord } from "../models.ts";
import { MatchRepo, PuzzleRepo } from "../repository.ts";

// games we generate daily puzzles for
const PUZZLE_GAME_KEYS: GameKey[] = ["nim", "guess"];

// need at least this many moves to carve out a position + solution
const MIN_MOVES_FOR_PUZZLE = 4;

// last N moves of a match become the solution; everything before is the position
const SOLUTION_MOVE_COUNT = 2;

/**
 * Returns today's puzzle for a game, or null if none has been generated yet.
 *
 * @param gameKey - Which game to look up.
 * @returns The PuzzleRecord for today, or null.
 */
export async function getTodaysPuzzle(gameKey: GameKey): Promise<PuzzleRecord | null> {
  const key = dailyPuzzleKey({ gameKey, date: new Date() });
  return PuzzleRepo.find(key);
}

/**
 * Finds a suitable match for the given game and writes a PuzzleRecord for that day.
 * Skips silently if no suitable match exists yet.
 *
 * @param gameKey - Which game to generate a puzzle for.
 * @param date - The calendar day this puzzle belongs to.
 * @returns The created PuzzleRecord, or null if no suitable match was found.
 */
export async function generatePuzzleForGame(
  gameKey: GameKey,
  date: Date,
): Promise<PuzzleRecord | null> {
  const key = dailyPuzzleKey({ gameKey, date });

  // don't overwrite a puzzle already generated for today
  const existing = await PuzzleRepo.find(key);
  if (existing) return existing;

  const allMatchKeys = await MatchRepo.getAllKeys();
  if (allMatchKeys.length === 0) return null;

  const allMatches = await MatchRepo.getMany(allMatchKeys);

  // pick the most recent win with enough moves
  const candidates = allMatches
    .filter(
      (match) =>
        match.gameKey === gameKey &&
        match.result.outcome === "win" &&
        match.moves.length >= MIN_MOVES_FOR_PUZZLE,
    )
    .sort((a, b) => (b.completedAt > a.completedAt ? 1 : -1));

  if (candidates.length === 0) return null;

  const sourceMatch = candidates[0];
  const sourceMatchId = allMatchKeys[allMatches.indexOf(sourceMatch)];
  const splitIndex = sourceMatch.moves.length - SOLUTION_MOVE_COUNT;

  const puzzle: PuzzleRecord = {
    gameKey,
    date: date.toISOString().slice(0, 10),
    position: { matchId: sourceMatchId, upToMoveIndex: splitIndex - 1 },
    solution: { moves: sourceMatch.moves.slice(splitIndex) },
    sourceMatchId,
    createdAt: new Date().toISOString(),
  };

  await PuzzleRepo.set(key, puzzle);
  return puzzle;
}

/**
 * Generates today's puzzle for every supported game.
 * Called by the daily puzzle cron job at midnight UTC.
 *
 * @param date - The day to generate puzzles for (defaults to today).
 */
export async function generateAllDailyPuzzles(date: Date = new Date()): Promise<void> {
  await Promise.all(PUZZLE_GAME_KEYS.map((gameKey) => generatePuzzleForGame(gameKey, date)));
}
