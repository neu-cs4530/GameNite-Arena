import {
  zCheckersMove,
  zConnect4Move,
  zTicTacToeMove,
  type CheckersView,
  type Connect4View,
  type GameKey,
  type GuessView,
  type NimView,
  type PuzzleView,
  type PuzzleViewerAttempt,
  type TicTacToeView,
  type TrainingPackEntry,
} from "@gamenite/shared";
import { notateNimMove } from "../games/replay/nimReducer.ts";
import { notateTicTacToeMove } from "../games/replay/tictactoeReducer.ts";
import { notateConnect4Move } from "../games/replay/connect4Reducer.ts";
import { notateCheckersMove } from "../games/replay/checkersReducer.ts";

/**
 * Narrowing layer between the wire `PuzzleView` (shared type; `position` is
 * per-game and typed unknown) and the typed view-model the puzzle surfaces
 * render from.
 *
 * The GET deliberately carries NO solution — that leak is closed. The
 * solution move and explanation only ever arrive on the attempt response
 * (`PuzzleAttemptResult`), and the hint comes from the authed hint endpoint
 * which forfeits the rated slot server-side.
 */

/** Per-game puzzle position, discriminated for the board dispatch. */
export type PuzzlePosition =
  | { kind: "nim"; view: NimView }
  | { kind: "guess"; view: GuessView }
  | { kind: "tictactoe"; view: TicTacToeView }
  | { kind: "connect4"; view: Connect4View }
  | { kind: "checkers"; view: CheckersView };

/** The narrowed view-model the puzzle surfaces render from. */
export interface DailyPuzzle {
  gameKey: GameKey;
  /** YYYY-MM-DD — MUST be echoed on attempt and hint payloads. */
  date: string;
  position: PuzzlePosition;
  sourceMatchId?: string;
  /** The signed-in viewer's standing against this puzzle (from `?for=`),
   * or null on an anonymous fetch / unknown user. */
  viewerAttempt: PuzzleViewerAttempt | null;
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

/** Checks that `board` is rows x cols of cells, each one of `entries`. */
function isBoardOf(board: unknown, rows: number, cols: number, entries: string[]): boolean {
  if (!Array.isArray(board) || board.length !== rows) return false;
  return board.every(
    (row) =>
      Array.isArray(row) &&
      row.length === cols &&
      row.every((cell) => typeof cell === "string" && entries.includes(cell)),
  );
}

/** Narrows a tic-tac-toe position: a 3x3 board, mid-game (no winner yet). */
function parseTicTacToePosition(position: unknown): TicTacToeView | null {
  if (!isRecord(position)) return null;
  const { board, nextPlayer, winningEntry } = position;
  if (winningEntry !== null) return null;
  if (nextPlayer !== 0 && nextPlayer !== 1) return null;
  if (!isBoardOf(board, 3, 3, [".", "O", "X"])) return null;
  return { board: board as TicTacToeView["board"], nextPlayer, winningEntry: null };
}

/** Narrows a connect4 position: a 6x7 board, mid-game (no winner yet). */
function parseConnect4Position(position: unknown): Connect4View | null {
  if (!isRecord(position)) return null;
  const { board, nextPlayer, winningEntry } = position;
  if (winningEntry !== null) return null;
  if (nextPlayer !== 0 && nextPlayer !== 1) return null;
  if (!isBoardOf(board, 6, 7, [".", "R", "Y"])) return null;
  return { board: board as Connect4View["board"], nextPlayer, winningEntry: null };
}

/** Narrows a checkers position: an 8x8 board, mid-game (no winner yet). */
function parseCheckersPosition(position: unknown): CheckersView | null {
  if (!isRecord(position)) return null;
  const { board, nextPlayer, winner, legalMoves } = position;
  if (winner !== null) return null;
  if (nextPlayer !== 0 && nextPlayer !== 1) return null;
  if (!isBoardOf(board, 8, 8, [".", "R", "B", "RK", "BK"])) return null;
  if (!Array.isArray(legalMoves)) return null;
  return {
    board: board as CheckersView["board"],
    nextPlayer,
    winner: null,
    legalMoves: legalMoves as CheckersView["legalMoves"],
  };
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
  tictactoe: (position) => {
    const view = parseTicTacToePosition(position);
    return view === null ? null : { kind: "tictactoe", view };
  },
  connect4: (position) => {
    const view = parseConnect4Position(position);
    return view === null ? null : { kind: "connect4", view };
  },
  checkers: (position) => {
    const view = parseCheckersPosition(position);
    return view === null ? null : { kind: "checkers", view };
  },
};

/**
 * Narrows a wire PuzzleView into the typed view-model, or null when the
 * payload doesn't match the game's expected position shape (e.g. a record
 * written by an older generator) — the page shows one well-defined error
 * instead of crashing inside a board component.
 *
 * @param view - The PuzzleView as received from GET /api/puzzle/:gameKey.
 * @returns The narrowed DailyPuzzle, or null when malformed.
 */
export function mapPuzzleView(view: PuzzleView): DailyPuzzle | null {
  const position = positionParsers[view.gameKey](view.position);
  if (position === null) return null;

  return {
    gameKey: view.gameKey,
    date: view.date,
    position,
    sourceMatchId: view.sourceMatchId,
    viewerAttempt: view.viewerAttempt ?? null,
  };
}

/** One practice entry from the training feed, position narrowed like DailyPuzzle. */
export interface TrainingPracticeItem {
  gameKey: GameKey;
  position: PuzzlePosition;
  sourceMatchId: string;
  createdAt: string;
}

/**
 * Narrows a wire TrainingPackEntry the same way mapPuzzleView does.
 *
 * @param entry - one entry from GET /api/puzzle/:gameKey/training.
 * @returns the narrowed TrainingPracticeItem, or null when malformed.
 */
export function mapTrainingPackEntry(entry: TrainingPackEntry): TrainingPracticeItem | null {
  const position = positionParsers[entry.gameKey](entry.position);
  if (position === null) return null;

  return { ...entry, position };
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
  if (gameKey === "tictactoe") {
    const safe = zTicTacToeMove.safeParse(move);
    if (safe.success) return notateTicTacToeMove(safe.data);
  }
  if (gameKey === "connect4") {
    const safe = zConnect4Move.safeParse(move);
    if (safe.success) return notateConnect4Move(safe.data);
  }
  if (gameKey === "checkers") {
    const safe = zCheckersMove.safeParse(move);
    if (safe.success) return notateCheckersMove(safe.data);
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
