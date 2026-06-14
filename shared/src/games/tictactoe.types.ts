import { z } from "zod";

export type TicTacEntry = "." | "O" | "X";

/**
 * A tic-tac-toe board state is a 3x3 array where each entry is either empty, X, or O.
 *
 * We always let player 1 go first, and assign them the `X` entry. Player 0 always
 * goes second and is the `O` entry. Therefore, the board always starts out looking like
 * this:
 *
 *     {
 *       board: [
 *         ['.', '.', '.'],
 *         ['.', '.', '.'],
 *         ['.', '.', '.'],
 *       ],
 *       nextPlayer: 1,
 *     }
 */
export interface TicTacToeState {
  board: TicTacEntry[][];
  nextPlayer: number;
}

/**
 * Tic-tac-toe, like Nim, gives every player the same information, so every
 * player (and people who are not playing) have the same view.
 *
 * If someone has already won, then **no more moves are allowed**, and the
 * view should contain this information as `winningEntry`. If the board looks
 * like this:
 *
 *    [ [ 'X', 'O', '.' ],
 *      [ 'X', '.', 'O' ],
 *      [ 'X', '.', '.' ] ]
 *
 * then winningEntry should be `[[0,0], [1,0], [2,0]]`. (Or some other permutation,
 * like `[[2,0], [1,0], [0, 0]]`.)
 *
 * If no one has triumphed yet, for example if the board looks like this:
 *
 *    [ [ 'X', 'O', '.' ],
 *      [ '.', '.', 'O' ],
 *      [ 'X', '.', '.' ] ]
 *
 * then winningEntry should be `null`.
 *
 * If there are multiple winning positions, any winning position can
 * be returned.
 */
export interface TicTacToeView {
  board: TicTacEntry[][];
  nextPlayer: number;
  winningEntry: null | [[number, number], [number, number], [number, number]];
}

/**
 * A move in tic-tac-toe is a two-element list of numbers between 0 and 2
 * (inclusive), representing an entry in the TicTacToe board where the current
 * player wants to put a mark.
 *
 * If the board looks like this:
 *
 *     XX.
 *     OO.
 *     XOX
 *
 * and it is O's turn (player 0), then the winning move is [1,2]. If player 0
 * makes the winning move [1,2], then the new board state looks like this:
 *
 *     XX.
 *     OOO
 *     XOX
 *
 * Moves can only be played in spaces without marks, so the only valid move O
 * can make at this point is [0,2], which results in a board that looks like
 * this:
 *
 *     XXO
 *     OO.
 *     XOX
 *
 * This is a stalemate! It will now be X's turn (that is, player 1's turn),
 * and the only valid move they can make is [1,2], which results in this
 * board, which has no winners:
 *
 *     XXO
 *     OOX
 *     XOX
 *
 */
export type TicTacToeMove = z.infer<typeof zTicTacToeMove>;
const tttPos = z.int().gte(0).lt(3);
export const zTicTacToeMove = z.tuple([tttPos, tttPos]);
