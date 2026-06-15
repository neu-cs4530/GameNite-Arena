import {
  zCheckersMove,
  type CheckersState,
  type CheckersView,
  type CheckersBoard,
  type CheckersEntry,
  type CheckersLegalMove,
} from "@gamenite/shared";
import type { GameLogic } from "./gameLogic.ts";
import { GameService } from "./gameServiceManager.ts";

const SIZE = 8;

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

/**
 * Regular pieces only move forward
 * Kings move all four diagonal directions.
 */
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

/**
 * Compute all simple (non-capture) moves for a single piece.
 * A piece can move one square in any of the four diagonal directions.
 */
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
 * All capture sequences (chains) starting from a single piece.
 *
 * Regular pieces capture once and stop. Kings must continue capturing until
 * no further capture is available.
 *
 * Captured pieces are tracked but not yet removed during chain creation.
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

/**
 * Compute all legal moves for the current player.
 * Captures are mandatory: if any capture is available, only captures are returned.
 */
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

/**
 * The opponent wins if the current player has no legal moves.
 */
function computeWinner(board: CheckersBoard, nextPlayer: number): null | 0 | 1 {
  if (computeLegalMoves(board, nextPlayer).length === 0) {
    return (1 - nextPlayer) as 0 | 1;
  }
  return null;
}

/**
 * True if two square sequences are pointwise equal.
 */
function sameSquares(a: [number, number][], b: [number, number][]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
  }
  return true;
}

/**
 * Apply a validated move sequence to the board, returning the new board.
 * Removes any captured pieces along the chain and promotes.
 */
function applyMove(
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

export const checkersLogic: GameLogic<CheckersState, CheckersView> = {
  minPlayers: 2,
  maxPlayers: 2,

  start: () => ({
    board: startingBoard(),
    nextPlayer: 0,
  }),

  update: (state, payload, playerIndex) => {
    if (state.nextPlayer !== playerIndex) return null;
    if (computeWinner(state.board, state.nextPlayer) !== null) return null;

    const safeMove = zCheckersMove.safeParse(payload);
    if (safeMove.error) return null;
    const { squares } = safeMove.data;

    const legal = computeLegalMoves(state.board, playerIndex);
    const isLegal = legal.some((m) => sameSquares(m.squares, squares));
    if (!isLegal) return null;

    return {
      board: applyMove(state.board, squares, playerIndex),
      nextPlayer: 1 - playerIndex,
    };
  },

  isDone: (state) => {
    return computeWinner(state.board, state.nextPlayer) !== null;
  },

  viewAs: (state) => {
    const winner = computeWinner(state.board, state.nextPlayer);
    return {
      board: state.board,
      nextPlayer: winner !== null ? -1 : state.nextPlayer,
      winner,
      legalMoves: winner !== null ? [] : computeLegalMoves(state.board, state.nextPlayer),
    };
  },

  tagView: (view) => ({ type: "checkers", view }),

  // computeWinner already returns 0 | 1 | null. Only called when isDone is
  // true (a player with no legal moves loses).
  winnerIndex: (state) => computeWinner(state.board, state.nextPlayer),

  parseMove: (payload) => {
    const move = zCheckersMove.safeParse(payload);
    return move.success ? move.data : null;
  },

  // a winning move is one that leaves the opponent with no legal moves
  isWinningMove: (state, payload) => {
    const mover = state.nextPlayer;
    const updated = checkersLogic.update(state, payload, mover);
    if (updated === null) return false;
    return checkersLogic.isDone(updated) && checkersLogic.winnerIndex!(updated) === mover;
  },
};

export const checkersGameService = new GameService<CheckersState, CheckersView>(checkersLogic);
