import type { GameKey } from "@gamenite/shared";
import { dailyPuzzleKey, type MatchRecord, type PuzzleRecord } from "../models.ts";
import { MatchRepo, PuzzleRepo } from "../repository.ts";
import { gameServices } from "./game.service.ts";

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
 * Returns today's puzzle, generating it on the spot if the midnight cron has
 * not produced one yet (e.g. fresh dev databases, or a server that booted
 * after midnight). Generation is idempotent via the deterministic
 * `${gameKey}:${date}` key — concurrent first requests both derive the same
 * record from the same most-recent match, so a benign double write is fine.
 *
 * @param gameKey - Which game to look up.
 * @returns The PuzzleRecord for today, or null when the archive has no
 *          suitable match to mine.
 */
export async function getOrGenerateTodaysPuzzle(gameKey: GameKey): Promise<PuzzleRecord | null> {
  const existing = await getTodaysPuzzle(gameKey);
  if (existing) return existing;
  return generatePuzzleForGame(gameKey, new Date());
}

/**
 * Replays a match's early moves through the real game logic to produce the
 * hydrated puzzle position, and strips the remaining moves down to their raw
 * payloads as the solution.
 *
 * The stored position is the WATCHER view (`viewAs(state, -1)`), so hidden
 * information — like the guess game's secret number — never reaches the
 * client inside the position.
 *
 * @param match - The archived source match.
 * @param splitIndex - Index of the first solution move.
 * @returns The hydrated position + raw solution moves, or null when the
 *          archived moves don't replay cleanly (corrupt entry).
 */
function hydrateSplit(
  match: MatchRecord,
  splitIndex: number,
): { position: unknown; solutionMoves: unknown[] } | null {
  const servicer = gameServices[match.gameKey];
  const players = match.participants.map((p) => p.id);

  // The recorder captures the state before the first move as `initialState`.
  // Older records without it fall back to a fresh start state — exact for
  // nim (deterministic start); for guess the secret only affects the
  // explanation, never the watcher-view position.
  let state: unknown = match.initialState ?? servicer.create(players).state;

  for (let i = 0; i < splitIndex; i += 1) {
    const recorded = match.moves[i];
    const playerIndex = match.participants.findIndex((p) => p.id === recorded.actor);
    const updated = servicer.update(state, recorded.move, playerIndex, players);
    if (updated === null) return null;
    state = updated.state;
  }

  return {
    position: servicer.view(state, -1).view,
    solutionMoves: match.moves.slice(splitIndex).map((m) => m.move),
  };
}

/**
 * Builds the one-liner shown to the user after they attempt the puzzle.
 * Kept honest: the solution is the line actually played in the archived
 * match, not an engine-proved optimum.
 *
 * @param gameKey - Which game the puzzle belongs to.
 * @param solutionMoves - The raw solution move payloads.
 * @returns A short human explanation of the archived winning line.
 */
function explainSolution(gameKey: GameKey, solutionMoves: unknown[]): string {
  const first = String(solutionMoves[0]);
  if (gameKey === "nim") {
    return (
      `From the archived match: the winner took ${first} here, ` +
      `steering the opponent into taking the last token (misère Nim — ` +
      `whoever takes the last token loses).`
    );
  }
  return (
    `From the archived match: the next player locked in ${first}. ` +
    `In Number Guesser the guess closest to the secret wins.`
  );
}

/**
 * Finds a suitable match for the given game and writes a PuzzleRecord for
 * that day. Skips silently if no suitable match exists yet.
 *
 * The stored record uses per-game shapes end to end: `position` is the
 * hydrated watcher view of the game state (e.g. `{remaining, nextPlayer}`
 * for nim), and `solution.moves` are raw move payloads (e.g. `3`) — the
 * exact encoding the attempt endpoint compares a submitted move against.
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

  // most recent wins first; fall through corrupt entries to older ones
  const candidates = allMatches
    .map((match, index) => ({ match, matchId: allMatchKeys[index] }))
    .filter(
      ({ match }) =>
        match.gameKey === gameKey &&
        match.result.outcome === "win" &&
        match.moves.length >= MIN_MOVES_FOR_PUZZLE,
    )
    .sort((a, b) => (b.match.completedAt > a.match.completedAt ? 1 : -1));

  for (const { match, matchId } of candidates) {
    const splitIndex = match.moves.length - SOLUTION_MOVE_COUNT;
    const hydrated = hydrateSplit(match, splitIndex);
    if (hydrated === null) continue;

    const puzzle: PuzzleRecord = {
      gameKey,
      date: date.toISOString().slice(0, 10),
      position: hydrated.position,
      solution: {
        moves: hydrated.solutionMoves,
        explanation: explainSolution(gameKey, hydrated.solutionMoves),
      },
      sourceMatchId: matchId,
      createdAt: new Date().toISOString(),
    };

    await PuzzleRepo.set(key, puzzle);
    return puzzle;
  }

  return null;
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
