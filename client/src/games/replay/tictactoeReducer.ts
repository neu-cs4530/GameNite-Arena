import type { TicTacEntry, TicTacToeMove, TicTacToeState, TicTacToeView } from "@gamenite/shared";

/**
 * Seat -> mark convention (mirrors the shared types): player 1 plays `X` and
 * moves first; player 0 plays `O`. So a freshly-started board has
 * `nextPlayer: 1`.
 */
function markFor(playerIndex: number): TicTacEntry {
  return playerIndex === 0 ? "O" : "X";
}

/** A pristine 3x3 board with player 1 (X) to move. */
export function buildInitialTicTacToeState(): TicTacToeState {
  return {
    board: [
      [".", ".", "."],
      [".", ".", "."],
      [".", ".", "."],
    ],
    nextPlayer: 1,
  };
}

/**
 * Apply one Tic-Tac-Toe move to produce the next state. Pure / total: the mark
 * placed is determined by `state.nextPlayer`, then the turn flips. Mirrors the
 * live move semantics (place mark, flip nextPlayer) so playback matches what
 * actually happened.
 */
export function applyTicTacToeMove(state: TicTacToeState, move: TicTacToeMove): TicTacToeState {
  const [row, col] = move;
  const board = state.board.map((r) => r.slice());
  board[row][col] = markFor(state.nextPlayer);
  return {
    board,
    nextPlayer: 1 - state.nextPlayer,
  };
}

/** All eight winning triples (rows, columns, diagonals). */
const WINNING_LINES: [[number, number], [number, number], [number, number]][] = [
  [
    [0, 0],
    [0, 1],
    [0, 2],
  ],
  [
    [1, 0],
    [1, 1],
    [1, 2],
  ],
  [
    [2, 0],
    [2, 1],
    [2, 2],
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
  ],
  [
    [0, 1],
    [1, 1],
    [2, 1],
  ],
  [
    [0, 2],
    [1, 2],
    [2, 2],
  ],
  [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  [
    [0, 2],
    [1, 1],
    [2, 0],
  ],
];

/** The first completed line on the board, or null if no one has won. */
function findWinningEntry(board: TicTacEntry[][]): TicTacToeView["winningEntry"] {
  for (const line of WINNING_LINES) {
    const [a, b, c] = line;
    const first = board[a[0]][a[1]];
    if (first !== "." && first === board[b[0]][b[1]] && first === board[c[0]][c[1]]) {
      return line;
    }
  }
  return null;
}

/**
 * Omniscient view for replays — Tic-Tac-Toe is perfect information, so the
 * view is the state plus the derived winning line (computed here rather than
 * tracked in state, matching what the live server sends).
 */
export function tictactoeViewFromState(state: TicTacToeState): TicTacToeView {
  return {
    board: state.board,
    nextPlayer: state.nextPlayer,
    winningEntry: findWinningEntry(state.board),
  };
}

/** Human-readable summary used by the move list. */
export function notateTicTacToeMove(move: TicTacToeMove): string {
  const [row, col] = move;
  const colLabel = String.fromCharCode("A".charCodeAt(0) + col);
  return `${colLabel}${row + 1}`;
}
