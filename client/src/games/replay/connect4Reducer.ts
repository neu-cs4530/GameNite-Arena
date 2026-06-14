import type { Connect4Move, Connect4State, Connect4View } from "@gamenite/shared";

/** Board geometry: 6 rows (top -> bottom) by 7 columns. */
export const C4_ROWS = 6;
export const C4_COLS = 7;

/** Player 0 plays Red ("R"), player 1 plays Yellow ("Y"). Player 0 moves first. */
const DISCS = ["R", "Y"] as const;

/** Build an empty 6x7 board with every cell set to "." */
function emptyBoard(): Connect4State["board"] {
  return Array.from({ length: C4_ROWS }, () => Array.from({ length: C4_COLS }, () => "." as const));
}

/** Default starting state for replays whose original state isn't recorded. */
export function buildInitialConnect4State(): Connect4State {
  return { board: emptyBoard(), nextPlayer: 0 };
}

/**
 * Apply one Connect 4 column-drop move to produce the next state. Pure / total.
 *
 * The disc for the current `nextPlayer` falls to the lowest empty row in the
 * given column; `nextPlayer` then flips. An out-of-range or full column is a
 * no-op (replays should only ever feed legal moves, but staying total keeps the
 * stepper robust to truncated/corrupt move lists).
 */
export function applyConnect4Move(state: Connect4State, move: Connect4Move): Connect4State {
  if (move < 0 || move >= C4_COLS) return state;

  // Find the lowest empty row in the column (bottom row is C4_ROWS - 1).
  let landingRow = -1;
  for (let row = C4_ROWS - 1; row >= 0; row--) {
    if (state.board[row][move] === ".") {
      landingRow = row;
      break;
    }
  }
  if (landingRow === -1) return state; // column full

  const board = state.board.map((r) => r.slice());
  board[landingRow][move] = DISCS[state.nextPlayer];

  return { board, nextPlayer: 1 - state.nextPlayer };
}

/**
 * Omniscient view for replays. Connect 4 is perfect information, so the board
 * and next player carry over directly. The reducer doesn't recompute winners
 * (it has no win-detection state to draw from), so `winningEntry` is left null;
 * the replay board simply renders the discs as they were dropped.
 */
export function connect4ViewFromState(state: Connect4State): Connect4View {
  return { board: state.board, nextPlayer: state.nextPlayer, winningEntry: null };
}

/** Human-readable summary used by the move list. */
export function notateConnect4Move(move: Connect4Move): string {
  return `Drop column ${move + 1}`;
}
