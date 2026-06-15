import { HINT_PENALTY } from "@gamenite/shared";
import type {
  GameKey,
  PuzzleAttemptResult,
  PuzzleHintResult,
  PuzzleViewerAttempt,
  TrainingAttemptResult,
  TrainingPackEntry,
} from "@gamenite/shared";
import { dailyPuzzleKey, puzzleHintKey, type MatchRecord, type PuzzleRecord } from "../models.ts";
import {
  MatchRepo,
  PuzzleAttemptRepo,
  PuzzleHintRepo,
  PuzzleRepo,
  UserRepo,
} from "../repository.ts";
import { getUserByUsername } from "./auth.service.ts";
import { gameServices } from "./game.service.ts";
import {
  updateRating,
  DEFAULT_RATING,
  DEFAULT_RD,
  DEFAULT_VOLATILITY,
  type Glicko2GameResult,
} from "./glicko2.service.ts";
import { invalidatePuzzleLeaderboardCache } from "./puzzleLeaderboard.service.ts";
import { dayBefore, effectiveStreak, isAttemptableDate } from "./puzzleStreak.util.ts";

/**
 * Games we generate daily puzzles for — deliberately a subset of all playable
 * games. A game qualifies only when its daily position is DEDUCIBLE: the
 * stored watcher view must contain everything a solver needs to find the
 * winning move from the board alone. Nim qualifies (the whole pile and whose
 * turn it is are the entire state). Guess does NOT — its watcher view shows
 * only who has guessed, never the values or the secret, so a guess "puzzle"
 * could only be solved by leaking the answer.
 *
 * Tictactoe, connect4, and checkers boards are also fully visible to
 * watchers, so they qualify too.
 *
 * Mirrors PUZZLE_GAME_KEYS in client/src/util/consts.ts; update both together.
 */
const PUZZLE_GAME_KEYS: GameKey[] = ["nim", "tictactoe", "connect4", "checkers"];

// need at least this many moves to carve out a position + solution
const MIN_MOVES_FOR_PUZZLE = 4;

// last N moves of a match become the solution; everything before is the
// position. nim puzzles are 2 moves from the end (misère: the loser's move
// leaves remaining ≡ 1 mod 4); tictactoe/connect4/checkers puzzles are just
// the winning move itself.
const solutionMoveCount: Record<GameKey, number> = {
  nim: 2,
  tictactoe: 1,
  connect4: 1,
  checkers: 1,
  guess: 2, // unused — guess isn't puzzle-eligible
};

/**
 * Returns the stored puzzle for one game and puzzle-day, or null when there
 * is none. Games outside PUZZLE_GAME_KEYS always resolve null — even a stale
 * stored record (written before a game was delisted) must never serve.
 *
 * @param gameKey - Which game to look up.
 * @param date - The puzzle day (YYYY-MM-DD).
 * @returns The PuzzleRecord for that day, or null.
 */
async function getPuzzleForDate(gameKey: GameKey, date: string): Promise<PuzzleRecord | null> {
  if (!PUZZLE_GAME_KEYS.includes(gameKey)) return null;
  return PuzzleRepo.find(`${gameKey}:${date}`);
}

/**
 * Returns today's puzzle for a game, or null if none has been generated yet.
 *
 * @param gameKey - Which game to look up.
 * @returns The PuzzleRecord for today, or null.
 */
export async function getTodaysPuzzle(gameKey: GameKey): Promise<PuzzleRecord | null> {
  return getPuzzleForDate(gameKey, new Date().toISOString().slice(0, 10));
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
 * client inside the position. The raw pre-split state is also returned so
 * the miner can soundness-check the split move against the game logic.
 *
 * @param match - The archived source match.
 * @param splitIndex - Index of the first solution move.
 * @returns The pre-split state, hydrated position, and raw solution moves,
 *          or null when the archived moves don't replay cleanly (corrupt
 *          entry).
 */
function hydrateSplit(
  match: MatchRecord,
  splitIndex: number,
): { state: unknown; position: unknown; solutionMoves: unknown[] } | null {
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
    state,
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
  const first = solutionMoves[0];
  if (gameKey === "nim") {
    return (
      `From the archived match: the winner took ${first} here, ` +
      `steering the opponent into taking the last token (misère Nim — ` +
      `whoever takes the last token loses).`
    );
  }
  if (gameKey === "tictactoe" && Array.isArray(first)) {
    const [row, col] = first as [number, number];
    return (
      `From the archived match: the next player marked row ${row + 1}, ` +
      `column ${col + 1} here, completing three in a row and winning on ` +
      `the spot.`
    );
  }
  if (gameKey === "connect4" && typeof first === "number") {
    return (
      `From the archived match: the next player dropped a disc in column ` +
      `${first + 1}, completing four in a row and winning on the spot.`
    );
  }
  if (gameKey === "checkers") {
    return (
      `From the archived match: this move wins on the spot, leaving the ` +
      `opponent with no legal moves.`
    );
  }
  return (
    `From the archived match: the next player locked in ${String(first)}. ` +
    `In Number Guesser the guess closest to the secret wins.`
  );
}

/** one archived match that passed the soundness check for a puzzle */
interface SoundCandidate {
  matchId: string;
  match: MatchRecord;
  hydrated: { state: unknown; position: unknown; solutionMoves: unknown[] };
}

/**
 * Scans the match archive for matches that could become a puzzle for
 * gameKey: right game, a win, long enough, and the split move passes
 * isWinningMove (the soundness check, e.g. nim: leaves remaining = 1 mod 4).
 *
 * @param gameKey - which game's archive to scan
 * @returns sound candidates, most-recent-first
 */
async function findSoundCandidates(gameKey: GameKey): Promise<SoundCandidate[]> {
  const allMatchKeys = await MatchRepo.getAllKeys();
  if (allMatchKeys.length === 0) return [];

  const allMatches = await MatchRepo.getMany(allMatchKeys);
  const servicer = gameServices[gameKey];

  // most recent first; corrupt/unsound entries just get skipped below
  const ordered = allMatches
    .map((match, index) => ({ match, matchId: allMatchKeys[index] }))
    .filter(
      ({ match }) =>
        match.gameKey === gameKey &&
        match.result.outcome === "win" &&
        match.moves.length >= MIN_MOVES_FOR_PUZZLE,
    )
    .sort((a, b) => (b.match.completedAt > a.match.completedAt ? 1 : -1));

  const candidates: SoundCandidate[] = [];
  for (const { match, matchId } of ordered) {
    const splitIndex = match.moves.length - solutionMoveCount[gameKey];
    const hydrated = hydrateSplit(match, splitIndex);
    if (hydrated === null) continue;
    if (servicer.isWinningMove(hydrated.state, hydrated.solutionMoves[0]) === false) continue;
    candidates.push({ matchId, match, hydrated });
  }
  return candidates;
}

/**
 * Finds a suitable match for the given game and writes a PuzzleRecord for
 * that day. Skips silently if no suitable match exists yet, and refuses
 * outright for games outside PUZZLE_GAME_KEYS (positions not deducible).
 *
 * Candidates are SOUNDNESS-checked: the archived split move must pass the
 * game's `isWinningMove` hook (nim: leaves remaining ≡ 1 mod 4). A match
 * whose winner blundered at the split — and only won because the opponent
 * blundered back — never becomes a puzzle, because its labeled solution
 * would lose to best play.
 *
 * The stored record uses per-game shapes end to end: `position` is the
 * hydrated watcher view of the game state (e.g. `{remaining, nextPlayer}`
 * for nim), and `solution.moves` are raw move payloads (e.g. `3`) — the
 * exact encoding the attempt endpoint grades a submitted move against.
 *
 * @param gameKey - Which game to generate a puzzle for.
 * @param date - The calendar day this puzzle belongs to.
 * @returns The created PuzzleRecord, or null if no suitable match was found.
 */
export async function generatePuzzleForGame(
  gameKey: GameKey,
  date: Date,
): Promise<PuzzleRecord | null> {
  if (!PUZZLE_GAME_KEYS.includes(gameKey)) return null;
  const key = dailyPuzzleKey({ gameKey, date });

  // don't overwrite a puzzle already generated for today
  const existing = await PuzzleRepo.find(key);
  if (existing) return existing;

  const [candidate] = await findSoundCandidates(gameKey);
  if (!candidate) return null;

  const puzzle: PuzzleRecord = {
    gameKey,
    date: date.toISOString().slice(0, 10),
    position: candidate.hydrated.position,
    solution: {
      moves: candidate.hydrated.solutionMoves,
      explanation: explainSolution(gameKey, candidate.hydrated.solutionMoves),
    },
    sourceMatchId: candidate.matchId,
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

// The daily puzzle has no dynamic rating of its own, so a rated attempt is
// scored against a fresh average player (1500 rating, 350 rd).
const puzzleOpponent = { opponentRating: DEFAULT_RATING, opponentRd: DEFAULT_RD };

/**
 * One graded submission against a daily puzzle. `date` is the puzzle-day the
 * client actually rendered (echoed from the GET): it pins the puzzle graded
 * against, the rated slot, the streak day, and the attempt log — a session
 * straddling UTC midnight is graded against the puzzle it shows. There is no
 * client-supplied hint count: hint state lives server-side in PuzzleHintRepo.
 */
export interface PuzzleAttemptInput {
  move: unknown;
  timeMs: number;
  date: string; // YYYY-MM-DD
}

/**
 * Grades one attempt against the puzzle pinned by `attempt.date` and applies
 * the daily rated-attempt economy:
 *
 * - GRADING goes through the game's `isWinningMove` hook: ANY winning move
 *   scores, and an archived blunder can never be the grading key. Exact JSON
 *   equality with `solution.moves[0]` is only a fallback for games without
 *   the hook. (The stored position is the watcher view; for nim it parses as
 *   the state directly.)
 * - Only the FIRST UNHINTED attempt per (user, game, puzzle-date) is RATED:
 *   it moves the user's per-game puzzle Glicko (`puzzleRatings[gameKey]`,
 *   created at 1500/350 on first use) and spends that date's rated slot
 *   (`puzzleLastRatedAt[gameKey] === date`). Every other attempt is practice:
 *   still graded and logged, but eloDelta 0 and rating frozen.
 * - The STREAK is decoupled from the rated slot: it advances on the first
 *   unhinted SUCCESSFUL solve of a puzzle-date, even when the rated slot was
 *   already spent by an earlier failure. Consecutive puzzle-dates chain;
 *   a gap resets the chain to 1. Hinted solves never advance it.
 * - An attempt is HINTED when PuzzleHintRepo holds a grant for this user and
 *   puzzle — the hint reveals the answer, so a hinted attempt is never rated
 *   and never advances the streak.
 * - The served streak is the EFFECTIVE streak as of the puzzle-day (zeroed
 *   when the stored chain is already broken); the raw record is history.
 *
 * @param userId - The attempting user (already authenticated by the caller).
 * @param gameKey - Which game's daily puzzle was attempted.
 * @param attempt - The raw move, elapsed time, and pinned puzzle-date.
 * @returns The graded result, or null when no puzzle exists for that date.
 */
export async function submitAttempt(
  userId: string,
  gameKey: GameKey,
  attempt: PuzzleAttemptInput,
  now: Date = new Date(),
): Promise<PuzzleAttemptResult | null> {
  const { date } = attempt;
  // Only today's (or yesterday's, for a midnight straddle) puzzle is live —
  // refusing older dates closes the backfill-a-streak hole.
  if (!isAttemptableDate(date, now.toISOString().slice(0, 10))) return null;
  const puzzle = await getPuzzleForDate(gameKey, date);
  if (!puzzle) return null;
  const puzzleId = `${gameKey}:${date}`;

  // grade through the game logic; archived-move equality only as a fallback
  const verdict = gameServices[gameKey].isWinningMove(puzzle.position, attempt.move);
  const success =
    verdict !== null
      ? verdict
      : JSON.stringify(attempt.move) === JSON.stringify(puzzle.solution.moves[0]);

  const userRecord = await UserRepo.get(userId);
  const hinted = (await PuzzleHintRepo.find(puzzleHintKey(userId, puzzleId))) !== null;
  const rated = !hinted && userRecord.puzzleLastRatedAt?.[gameKey] !== date;

  const currentRating = userRecord.puzzleRatings[gameKey] ?? {
    rating: DEFAULT_RATING,
    rd: DEFAULT_RD,
    vol: DEFAULT_VOLATILITY,
  };
  let newRating = currentRating;
  let eloDelta = 0;

  if (rated) {
    const result: Glicko2GameResult = { ...puzzleOpponent, score: success ? 1.0 : 0.0 };
    const updated = updateRating(
      {
        rating: currentRating.rating,
        rd: currentRating.rd,
        volatility: currentRating.vol,
      },
      [result],
    );
    newRating = { rating: updated.rating, rd: updated.rd, vol: updated.volatility };
    eloDelta = Math.round(newRating.rating - currentRating.rating);
  }

  // Streak: first unhinted successful solve of this puzzle-date, rated or
  // not. The `<` guard keeps a late solve of an OLDER date's puzzle from
  // regressing lastSolvedAt and nuking a live chain.
  const storedStreak = userRecord.puzzleStreak;
  const advancesStreak =
    success &&
    !hinted &&
    (storedStreak.lastSolvedAt === undefined || storedStreak.lastSolvedAt < date);
  let newStreak = storedStreak;
  if (advancesStreak) {
    const current = storedStreak.lastSolvedAt === dayBefore(date) ? storedStreak.current + 1 : 1;
    newStreak = {
      current,
      best: Math.max(current, storedStreak.best),
      lastSolvedAt: date,
    };
  }

  // persist whenever rating OR streak changed
  if (rated || advancesStreak) {
    await UserRepo.set(userId, {
      ...userRecord,
      puzzleRatings: rated
        ? { ...userRecord.puzzleRatings, [gameKey]: newRating }
        : userRecord.puzzleRatings,
      puzzleStreak: newStreak,
      puzzleLastRatedAt: rated
        ? { ...userRecord.puzzleLastRatedAt, [gameKey]: date }
        : userRecord.puzzleLastRatedAt,
    });
    await invalidatePuzzleLeaderboardCache(gameKey);
  }

  await PuzzleAttemptRepo.add({
    puzzleId,
    attemptedBy: { id: userId, type: "human" },
    success,
    rated,
    timeMs: attempt.timeMs,
    hintsUsed: hinted ? 1 : 0,
    eloDelta,
    createdAt: new Date().toISOString(),
  });

  return {
    success,
    rated,
    eloDelta,
    newRating,
    // every served streak is the EFFECTIVE streak, never the raw record
    streak: effectiveStreak(newStreak, date),
    solutionMove: puzzle.solution.moves[0],
    explanation: puzzle.solution.explanation,
  };
}

/**
 * Reveals the archived solution move for the puzzle pinned by `date` and
 * records the grant in PuzzleHintRepo under `<userId>|<puzzleId>`. From this
 * point every attempt by this user on this puzzle is hinted: never rated,
 * never streak-advancing. Also takes HINT_PENALTY points off the user's
 * puzzle rating but only the first time. asking again is free.
 *
 * @param userId - The requesting user (already authenticated by the caller).
 * @param gameKey - Which game's daily puzzle the hint is for.
 * @param date - The puzzle-day (YYYY-MM-DD) the client is rendering.
 * @returns The hint payload, or null when no puzzle exists for that date.
 */
export async function grantHint(
  userId: string,
  gameKey: GameKey,
  date: string,
  now: Date = new Date(),
): Promise<PuzzleHintResult | null> {
  if (!isAttemptableDate(date, now.toISOString().slice(0, 10))) return null;
  const puzzle = await getPuzzleForDate(gameKey, date);
  if (!puzzle) return null;
  const puzzleId = `${gameKey}:${date}`;

  const key = puzzleHintKey(userId, puzzleId);
  const existing = await PuzzleHintRepo.find(key);

  const userRecord = await UserRepo.get(userId);
  const currentRating = userRecord.puzzleRatings[gameKey] ?? {
    rating: DEFAULT_RATING,
    rd: DEFAULT_RD,
    vol: DEFAULT_VOLATILITY,
  };

  let newRating = currentRating;
  if (existing === null) {
    await PuzzleHintRepo.set(key, { userId, puzzleId, grantedAt: new Date().toISOString() });
    newRating = { ...currentRating, rating: currentRating.rating - HINT_PENALTY };
    await UserRepo.set(userId, {
      ...userRecord,
      puzzleRatings: { ...userRecord.puzzleRatings, [gameKey]: newRating },
    });
    await invalidatePuzzleLeaderboardCache(gameKey);
  }

  return {
    hintMove: puzzle.solution.moves[0],
    explanation: puzzle.solution.explanation,
    eloDelta: -HINT_PENALTY,
    newRating,
  };
}

/**
 * Summarizes one user's standing against one puzzle from the attempt log,
 * for the GET's `?for=<username>` affordance (solved badges on Home/Portal).
 *
 * @param username - The viewer's username (NOT id — it comes from the URL).
 * @param puzzleId - The puzzle's deterministic `<gameKey>:<date>` key.
 * @returns The viewer's attempted/solved/rated flags, or null when no such
 *          user exists.
 */
export async function getViewerAttempt(
  username: string,
  puzzleId: string,
): Promise<PuzzleViewerAttempt | null> {
  const user = await getUserByUsername(username);
  if (!user) return null;

  const keys = await PuzzleAttemptRepo.getAllKeys();
  const allAttempts = keys.length > 0 ? await PuzzleAttemptRepo.getMany(keys) : [];
  const mine = allAttempts.filter(
    (a) => a.puzzleId === puzzleId && a.attemptedBy.id === user.userId,
  );

  return {
    attempted: mine.length > 0,
    solved: mine.some((a) => a.success),
    // records written before the profile rework lack `rated` — fall back to
    // the nonzero eloDelta that only rated attempts could carry
    rated: mine.some((a) => a.rated ?? a.eloDelta !== 0),
  };
}

/**
 * Extra unrated practice positions for gameKey, mined from the same archive
 * as the daily puzzle. Nothing gets stored, every call just re-scans the
 * archive via findSoundCandidates.
 *
 * @param gameKey - which game's training feed to build
 * @param opts.limit - max entries to return
 * @param opts.exclude - sourceMatchIds to skip (e.g. already-seen ids on a
 *   "load more" page). Today's daily puzzle is always excluded too.
 * @returns up to `limit` practice positions, most-recent-first
 */
export async function getTrainingPack(
  gameKey: GameKey,
  opts: { limit: number; exclude?: string[] },
): Promise<TrainingPackEntry[]> {
  if (!PUZZLE_GAME_KEYS.includes(gameKey)) return [];

  const todays = await getTodaysPuzzle(gameKey);
  const excluded = new Set(opts.exclude ?? []);
  if (todays?.sourceMatchId) excluded.add(todays.sourceMatchId);

  const candidates = await findSoundCandidates(gameKey);
  const entries: TrainingPackEntry[] = [];
  for (const candidate of candidates) {
    if (excluded.has(candidate.matchId)) continue;
    entries.push({
      gameKey,
      position: candidate.hydrated.position,
      sourceMatchId: candidate.matchId,
      createdAt: candidate.match.completedAt,
    });
    if (entries.length >= opts.limit) break;
  }
  return entries;
}

/**
 * Grades one practice attempt against the archived match sourceMatchId.
 * Re-derives the solution from the archive each time and never touches
 * PuzzleAttemptRepo, ratings, or streaks.
 *
 * @param gameKey - which game the attempt is for
 * @param sourceMatchId - the archived match the position came from
 * @param move - the player's submitted move
 * @returns the graded result, or null if sourceMatchId doesn't replay to a
 *   sound position for this game
 */
export async function submitTrainingAttempt(
  gameKey: GameKey,
  sourceMatchId: string,
  move: unknown,
): Promise<TrainingAttemptResult | null> {
  const match = await MatchRepo.find(sourceMatchId);
  if (!match || match.gameKey !== gameKey) return null;

  const hydrated = hydrateSplit(match, match.moves.length - solutionMoveCount[gameKey]);
  if (hydrated === null) return null;

  const verdict = gameServices[gameKey].isWinningMove(hydrated.state, move);
  const success =
    verdict !== null ? verdict : JSON.stringify(move) === JSON.stringify(hydrated.solutionMoves[0]);

  return {
    success,
    solutionMove: hydrated.solutionMoves[0],
    explanation: explainSolution(gameKey, hydrated.solutionMoves),
  };
}
