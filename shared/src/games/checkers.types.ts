import { z } from "zod";

/**
 * A checkers board entry:
 *  - "."  — empty square
 *  - "R"  — red piece (player 0)
 *  - "B"  — black piece (player 1)
 *  - "RK" — red king
 *  - "BK" — black king
 */
export type CheckersEntry = "." | "R" | "B" | "RK" | "BK";
export type CheckersRow = CheckersEntry[];
export type CheckersBoard = CheckersRow[];

/**
 * A checkers board state is an 8x8 grid.
 *
 * Row 0 is the top of the board (black's home side), row 7 is the bottom
 * (red's home side). Pieces only occupy dark squares ((row + col) % 2 === 1).
 *
 * Player 0 is Red ("R"/"RK") and Player 1 is Black ("B"/"BK"). Player 0 goes first.
 *
 * Regular pieces may only move forward (red toward row 0, black toward row 7).
 * Kings may move in all four diagonal directions, including backwards.
 *
 * When a regular piece reaches the opposite back rank (row 0 for red, row 7
 * for black), it is promoted to a king.
 *
 * After a king captures a piece, if another capture is available from its new
 * position, the king must continue capturing. Regular pieces perform a single
 * capture and their turn ends.
 *
 * Starting positions:
 *  - Rows 0–2: black pieces on dark squares
 *  - Rows 5–7: red pieces on dark squares
 *  - Rows 3–4: empty
 */
export interface CheckersState {
  board: CheckersBoard;
  nextPlayer: number;
}

/**
 * A legal move available to the current player, represented as the sequence
 * of squares the piece visits. A simple move has two squares (from → to); a
 * multi-capture chain (king only) has three or more.
 */
export interface CheckersLegalMove {
  squares: [number, number][];
}

/**
 * The view of a checkers game — identical for all players and watchers.
 *
 * - `board`: the current board
 * - `nextPlayer`: whose turn it is (0 = red, 1 = black), or -1 if the game is over
 * - `winner`: null if ongoing, 0 if red won, 1 if black won
 * - `legalMoves`: all legal moves for the current player, each as a full sequence
 */
export interface CheckersView {
  board: CheckersBoard;
  nextPlayer: number;
  winner: null | 0 | 1;
  legalMoves: CheckersLegalMove[];
}

/**
 * A move submitted by a player. `squares` is the full sequence of squares the
 * piece visits; minimum length 2 (from → to), longer for multi-capture chains.
 */
export type CheckersMove = z.infer<typeof zCheckersMove>;
const checkersPos = z.tuple([z.int().gte(0).lt(8), z.int().gte(0).lt(8)]);
export const zCheckersMove = z.object({
  squares: z.array(checkersPos).min(2),
});
