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

type WinningEntry = Exclude<Connect4View["winningEntry"], null>;

/** Directions to scan for four-in-a-row: across, down, and both diagonals. */
const WIN_DIRECTIONS: [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/** The first four-in-a-row on the board, or null if there isn't one. */
function findWinningEntry(board: Connect4State["board"]): WinningEntry | null {
  for (let row = 0; row < C4_ROWS; row++) {
    for (let col = 0; col < C4_COLS; col++) {
      const entry = board[row][col];
      if (entry === ".") continue;
      for (const [dr, dc] of WIN_DIRECTIONS) {
        const line: WinningEntry = [
          [row, col],
          [row + dr, col + dc],
          [row + dr * 2, col + dc * 2],
          [row + dr * 3, col + dc * 3],
        ];
        const [endRow, endCol] = line[3];
        if (endRow < 0 || endRow >= C4_ROWS || endCol < 0 || endCol >= C4_COLS) continue;
        if (line.every(([r, c]) => board[r][c] === entry)) return line;
      }
    }
  }
  return null;
}

/**
 * Omniscient view for replays. Connect 4 is perfect information, so the board
 * and next player carry over directly; `winningEntry` is recomputed from the
 * board so the replay board highlights a completed line, matching what the
 * live server sends.
 */
export function connect4ViewFromState(state: Connect4State): Connect4View {
  return {
    board: state.board,
    nextPlayer: state.nextPlayer,
    winningEntry: findWinningEntry(state.board),
  };
}

/** Human-readable summary used by the move list. */
export function notateConnect4Move(move: Connect4Move): string {
  return `Drop column ${move + 1}`;
}
