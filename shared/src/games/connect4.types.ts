import { z } from "zod";

export type Connect4Entry = "." | "R" | "Y";
export type Connect4Row = Connect4Entry[];
export type Connect4Board = Connect4Row[];

/**
 * * A Connect 4 board state is a 6x7 array (6 rows, 7 columns) where each
 * entry is either empty ("."), Red ("R"), or Yellow ("Y").
 *
 * Row 0 is the top of the board, row 5 is the bottom. Pieces fall downward,
 * so the bottom rows fill first.
 *
 * Player 0 is Red ("R") and player 1 is Yellow ("Y"). Player 0 goes first.
 *
 */
export interface Connect4State {
  board: Connect4Board;
  nextPlayer: number;
}

/**
 * Connect 4, like Tic-Tac-Toe, gives every player the same information, so
 * every player (and people who are not playing) have the same view.
 *
 * If someone has already won, then **no more moves are allowed**, and the
 * view should contain this information as `winningEntry` — an array of four
 * [row, col] pairs identifying the winning cells, or `null` if no one has
 * won yet.
 */
export interface Connect4View {
  board: Connect4Board;
  nextPlayer: number;
  winningEntry: null | [[number, number], [number, number], [number, number], [number, number]];
}

/**
 * A move in Connect 4 is a single column index (0–6). The piece drops to the
 * lowest unoccupied row in that column.
 *
 * A move is invalid if the column is full (i.e. row 0 of that column is not ".").
 */
export type Connect4Move = z.infer<typeof zConnect4Move>;
export const zConnect4Move = z.int().gte(0).lt(7);
