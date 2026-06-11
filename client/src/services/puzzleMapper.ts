import type { GameKey, GuessView, NimView } from "@gamenite/shared";
import { notateNimMove } from "../games/replay/nimReducer.ts";

/**
 * The PuzzleRecord exactly as the server sends it. `position` and the
 * solution moves are per-game shapes the server types as unknown; this
 * mapper is the single place that narrows them for the UI.
 *
 * ⚠️ The solution rides along with the GET — the puzzle page must NEVER
 * render `solutionMoves`/`explanation` before the user has attempted (the
 * one sanctioned pre-attempt peek is the single-move hint). That discipline
 * is client-side by design; see the puzzle card component.
 */
export interface PuzzleRecordWire {
  gameKey: GameKey;
  date: string;
  position: unknown;
  solution: { moves: unknown[]; explanation?: string };
  sourceMatchId?: string;
  createdAt: string;
}

/** Per-game puzzle position, discriminated for the board dispatch. */
export type PuzzlePosition = { kind: "nim"; view: NimView } | { kind: "guess"; view: GuessView };

/** The narrowed view-model the puzzles page renders from. */
export interface DailyPuzzle {
  gameKey: GameKey;
  date: string;
  position: PuzzlePosition;
  solutionMoves: unknown[];
  explanation?: string;
  sourceMatchId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Narrows a nim position: `{remaining, nextPlayer}`, both numbers. */
function parseNimPosition(position: unknown): NimView | null {
  if (!isRecord(position)) return null;
  const { remaining, nextPlayer } = position;
  if (typeof remaining !== "number" || typeof nextPlayer !== "number") return null;
  return { remaining, nextPlayer };
}

/** Narrows a guess position: the unfinished watcher view (no secret). */
function parseGuessPosition(position: unknown): GuessView | null {
  if (!isRecord(position)) return null;
  if (position.finished !== false) return null;
  const { guesses } = position;
  if (!Array.isArray(guesses) || !guesses.every((g) => typeof g === "boolean")) return null;
  return { finished: false, guesses };
}

const positionParsers: { [key in GameKey]: (position: unknown) => PuzzlePosition | null } = {
  nim: (position) => {
    const view = parseNimPosition(position);
    return view === null ? null : { kind: "nim", view };
  },
  guess: (position) => {
    const view = parseGuessPosition(position);
    return view === null ? null : { kind: "guess", view };
  },
};

/**
 * Narrows a wire PuzzleRecord into the typed view-model, or null when the
 * payload doesn't match the game's expected position shape (e.g. a record
 * written by an older generator) — the page shows one well-defined error
 * instead of crashing inside a board component.
 *
 * @param record - The PuzzleRecord as received from GET /api/puzzle/:gameKey.
 * @returns The narrowed DailyPuzzle, or null when malformed.
 */
export function mapPuzzleRecord(record: PuzzleRecordWire): DailyPuzzle | null {
  const position = positionParsers[record.gameKey](record.position);
  if (position === null) return null;
  if (record.solution.moves.length === 0) return null;

  return {
    gameKey: record.gameKey,
    date: record.date,
    position,
    solutionMoves: record.solution.moves,
    explanation: record.solution.explanation,
    sourceMatchId: record.sourceMatchId,
  };
}

/**
 * Human notation for one puzzle move — reuses the replay move-list notation
 * for nim so moves read identically across the app.
 *
 * @param gameKey - Which game the move belongs to.
 * @param move - The raw move payload.
 * @returns A short label like "Take 3" or "Guess 41".
 */
export function describePuzzleMove(gameKey: GameKey, move: unknown): string {
  if (typeof move === "number") {
    if (gameKey === "nim" && move >= 1 && move <= 3) {
      return notateNimMove(move);
    }
    if (gameKey === "guess") return `Guess ${move}`;
  }
  return JSON.stringify(move);
}

/**
 * Formats a rating delta with an explicit sign so gains and losses are
 * unambiguous in the result tiles.
 *
 * @param delta - The rating change (already rounded by the server).
 * @returns "+12", "-8", or "±0".
 */
export function formatEloDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return "±0";
}

/**
 * The Puzzle Glicko tile's sub-line for one attempt. Rated attempts show the
 * signed delta; practice attempts (retries, hinted solves) say so outright —
 * a "±0" there would read as a rated attempt that happened to move nothing.
 *
 * @param rated - Whether the server rated the attempt.
 * @param eloDelta - The rating change (0 for practice attempts).
 * @returns "+12 this attempt" or "practice — rating unchanged".
 */
export function describeRatingChange(rated: boolean, eloDelta: number): string {
  if (!rated) return "practice — rating unchanged";
  return `${formatEloDelta(eloDelta)} this attempt`;
}
