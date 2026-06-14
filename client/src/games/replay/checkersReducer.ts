import type {
  CheckersBoard,
  CheckersEntry,
  CheckersLegalMove,
  CheckersMove,
  CheckersState,
  CheckersView,
} from "@gamenite/shared";

/**
 * Replay reducer for Checkers.
 *
 * Mirrors `nimReducer.ts` / `guessReducer.ts`: a set of pure, total helpers
 * the replay viewer can use to step an archived game forward and derive an
 * omniscient read-only view at any move index.
 *
 * The move-application logic (capture removal, promotion) and the legal-move
 * computation are ported from the server engine
 * (`server/src/games/checkers.ts`) so replays stay faithful to live games —
 * including which pieces show as movable/destinations on the read-only board.
 */

const SIZE = 8;

/* --- Standard starting position (mirrors the server engine) ----------- */

export const checkersDefaultStart: CheckersState = {
  board: startingBoard(),
  nextPlayer: 0,
};

function emptyBoard(): CheckersBoard {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(".") as CheckersEntry[]);
}

function startingBoard(): CheckersBoard {
  const board = emptyBoard();
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if ((row + col) % 2 !== 1) continue;
      if (row <= 2) board[row][col] = "B";
      else if (row >= 5) board[row][col] = "R";
    }
  }
  return board;
}

/* --- Engine-ported geometry / move generation ------------------------- */

function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

function isKing(entry: CheckersEntry): boolean {
  return entry === "RK" || entry === "BK";
}

function entryOwner(entry: CheckersEntry): number | null {
  if (entry === "R" || entry === "RK") return 0;
  if (entry === "B" || entry === "BK") return 1;
  return null;
}

function ownsPiece(board: CheckersBoard, row: number, col: number, player: number): boolean {
  return entryOwner(board[row][col]) === player;
}

function isOpponent(board: CheckersBoard, row: number, col: number, player: number): boolean {
  return entryOwner(board[row][col]) === 1 - player;
}

/** Regular pieces move forward only; kings move all four diagonals. */
function directionsFor(player: number, kingPiece: boolean): [number, number][] {
  if (kingPiece) {
    return [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
  }
  const dr = player === 0 ? -1 : 1;
  return [
    [dr, -1],
    [dr, 1],
  ];
}

function simpleMoves(board: CheckersBoard, row: number, col: number): CheckersLegalMove[] {
  const entry = board[row][col];
  const owner = entryOwner(entry);
  if (owner === null) return [];
  const moves: CheckersLegalMove[] = [];
  for (const [dr, dc] of directionsFor(owner, isKing(entry))) {
    const nr = row + dr;
    const nc = col + dc;
    if (inBounds(nr, nc) && board[nr][nc] === ".") {
      moves.push({
        squares: [
          [row, col],
          [nr, nc],
        ],
      });
    }
  }
  return moves;
}

/**
 * All capture chains starting from a single piece. Regular pieces capture
 * once and stop; kings continue until no further capture is available.
 */
function captureChainsFor(
  board: CheckersBoard,
  startRow: number,
  startCol: number,
): CheckersLegalMove[] {
  const entry = board[startRow][startCol];
  const owner = entryOwner(entry);
  if (owner === null) return [];
  const kingPiece = isKing(entry);
  const chains: CheckersLegalMove[] = [];
  const path: [number, number][] = [[startRow, startCol]];
  const captured = new Set<string>();

  function dfs(r: number, c: number) {
    let extended = false;
    for (const [dr, dc] of directionsFor(owner!, kingPiece)) {
      const mr = r + dr;
      const mc = c + dc;
      const lr = r + 2 * dr;
      const lc = c + 2 * dc;
      if (!inBounds(lr, lc)) continue;
      if (captured.has(`${mr},${mc}`)) continue;
      if (!isOpponent(board, mr, mc, owner!)) continue;
      const isStart = lr === startRow && lc === startCol;
      if (board[lr][lc] !== "." && !isStart) continue;

      captured.add(`${mr},${mc}`);
      path.push([lr, lc]);

      if (kingPiece) {
        dfs(lr, lc);
      } else {
        chains.push({ squares: path.map((p) => [p[0], p[1]]) });
      }

      path.pop();
      captured.delete(`${mr},${mc}`);
      extended = true;
    }
    if (kingPiece && !extended && path.length > 1) {
      chains.push({ squares: path.map((p) => [p[0], p[1]]) });
    }
  }

  dfs(startRow, startCol);
  return chains;
}

/** Captures are mandatory: if any exist, only captures are returned. */
function computeLegalMoves(board: CheckersBoard, player: number): CheckersLegalMove[] {
  const allCaptures: CheckersLegalMove[] = [];
  const allSimple: CheckersLegalMove[] = [];

  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (!ownsPiece(board, row, col, player)) continue;
      allCaptures.push(...captureChainsFor(board, row, col));
      allSimple.push(...simpleMoves(board, row, col));
    }
  }

  return allCaptures.length > 0 ? allCaptures : allSimple;
}

/** The opponent wins if the player to move has no legal moves. */
function computeWinner(board: CheckersBoard, nextPlayer: number): null | 0 | 1 {
  if (computeLegalMoves(board, nextPlayer).length === 0) {
    return (1 - nextPlayer) as 0 | 1;
  }
  return null;
}

/* --- Move application (ported from the engine's applyMove) ------------- */

/**
 * Apply one move's square sequence to a board, returning a new board.
 * Removes captured pieces along the chain and promotes on the back rank.
 * Pure / total: assumes the recorded move is well-formed (replays only ever
 * contain moves that were legal when played).
 */
export function applyCheckersBoard(
  board: CheckersBoard,
  squares: [number, number][],
  player: number,
): CheckersBoard {
  const newBoard = board.map((r) => [...r]) as CheckersBoard;
  const [startR, startC] = squares[0];
  const piece = newBoard[startR][startC];
  newBoard[startR][startC] = ".";

  for (let i = 1; i < squares.length; i++) {
    const [pr, pc] = squares[i - 1];
    const [r, c] = squares[i];
    if (Math.abs(r - pr) === 2) {
      newBoard[(pr + r) / 2][(pc + c) / 2] = ".";
    }
  }

  const [endR, endC] = squares[squares.length - 1];
  let finalPiece: CheckersEntry = piece;
  if (!isKing(piece)) {
    if (player === 0 && endR === 0) finalPiece = "RK";
    else if (player === 1 && endR === SIZE - 1) finalPiece = "BK";
  }
  newBoard[endR][endC] = finalPiece;
  return newBoard;
}

/* --- Reducer surface (parallels nimReducer/guessReducer) -------------- */

/**
 * Apply one Checkers move to produce the next state. Pure / total.
 *
 * `playerIndex` is which seat played the move; if omitted we trust
 * `state.nextPlayer` (the engine always alternates strictly).
 */
export function applyCheckersMove(
  state: CheckersState,
  move: CheckersMove,
  playerIndex: number = state.nextPlayer,
): CheckersState {
  return {
    board: applyCheckersBoard(state.board, move.squares, playerIndex),
    nextPlayer: 1 - playerIndex,
  };
}

/**
 * Omniscient view for replays. Checkers is perfect information, so the view is
 * fully derivable from state: we recompute winner + legal moves the same way
 * the server's `viewAs` does, so the read-only board can faithfully highlight
 * movable pieces / destinations at any step.
 */
export function checkersViewFromState(state: CheckersState): CheckersView {
  const winner = computeWinner(state.board, state.nextPlayer);
  return {
    board: state.board,
    nextPlayer: winner !== null ? -1 : state.nextPlayer,
    winner,
    legalMoves: winner !== null ? [] : computeLegalMoves(state.board, state.nextPlayer),
  };
}

/** Human-readable summary used by the move list. */
export function notateCheckersMove(move: CheckersMove): string {
  const fmt = ([r, c]: [number, number]) => `${String.fromCharCode(97 + c)}${SIZE - r}`;
  const sep = move.squares.length > 2 || isCaptureMove(move.squares) ? "x" : "-";
  return move.squares.map(fmt).join(sep);
}

function isCaptureMove(squares: [number, number][]): boolean {
  return squares.length >= 2 && Math.abs(squares[1][0] - squares[0][0]) === 2;
}
