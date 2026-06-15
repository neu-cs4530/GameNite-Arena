import {
  type Connect4Board,
  type Connect4Row,
  type Connect4State,
  type Connect4View,
  type Connect4Entry,
  zConnect4Move,
} from "@gamenite/shared";
import type { GameLogic } from "./gameLogic.ts";
import { GameService } from "./gameServiceManager.ts";

const H = "horizontal";
const V = "vertical";
const SE = "south-east";
const SW = "south-west";
const NO_EMPTY = "No empty cells";
type Win = { pattern: string; start: number[] };
type WinningEntry = [[number, number], [number, number], [number, number], [number, number]];

function validateInputs(gs: Connect4State, playerIndex: number | null): boolean {
  if (!(typeof gs.nextPlayer === "number" && [0, 1].includes(gs.nextPlayer))) {
    return false;
  }
  const board = gs.board;
  if (
    board.length !== 6 ||
    board.some((row) => row.length !== 7) ||
    board.some((row) => row.some((cell) => !["R", ".", "Y"].includes(cell)))
  ) {
    return false;
  }
  if (playerIndex !== null && gs.nextPlayer !== playerIndex) {
    return false;
  }
  return true;
}

function isPatternWinner(pattern: string, board: Connect4Board, i: number, j: number): Win | null {
  const iLen = board.length;
  const jLen = board[0]?.length;
  const startVal = board[i][j];
  let windowEnd: number;
  let windowEndI: number;
  let windowEndJ: number;
  if (startVal === ".") {
    return null;
  }
  switch (pattern) {
    case H:
      windowEnd = j + 4;
      if (windowEnd <= jLen && board[i].slice(j, windowEnd).every((c) => c === startVal)) {
        return { pattern: H, start: [i, j] };
      } else {
        return null;
      }
    case V:
      windowEnd = i + 4;
      if (
        windowEnd <= iLen &&
        board
          .slice(i, windowEnd)
          .map((row) => row[j])
          .every((c) => c === startVal)
      ) {
        return { pattern: V, start: [i, j] };
      } else {
        return null;
      }
    case SE:
      windowEndI = i + 4;
      windowEndJ = j + 4;
      if (
        windowEndI <= iLen &&
        windowEndJ <= jLen &&
        board
          .slice(i, windowEndI)
          .map((row, index) => row[index + j])
          .every((c) => c === startVal)
      ) {
        return { pattern: SE, start: [i, j] };
      } else {
        return null;
      }
    case SW:
      windowEndI = i + 4;
      windowEndJ = j - 3;
      if (
        windowEndI <= iLen &&
        windowEndJ >= 0 &&
        board
          .slice(i, windowEndI)
          .map((row, index) => row[j - index])
          .every((c) => c === startVal)
      ) {
        return { pattern: SW, start: [i, j] };
      } else {
        return null;
      }
    default:
      return null;
  }
}

function winFullSweep(state: Connect4State): Win | null {
  const board = state.board;
  let emptyCount = 0;

  for (let i = 0; i < board.length; i++) {
    for (let j = 0; j < board[i]?.length; j++) {
      if (board[i][j] !== ".") {
        const horPat = isPatternWinner(H, board, i, j);
        const vertPat = isPatternWinner(V, board, i, j);
        const southEastPat = isPatternWinner(SE, board, i, j);
        const southWestPat = isPatternWinner(SW, board, i, j);
        if (horPat !== null) return horPat;
        if (vertPat !== null) return vertPat;
        if (southEastPat !== null) return southEastPat;
        if (southWestPat !== null) return southWestPat;
      } else {
        emptyCount++;
      }
    }
  }
  if (emptyCount === 0) {
    return { pattern: NO_EMPTY, start: [-1, -1] };
  }
  return null;
}

function buildWinningEntry(winningLocation: Win): WinningEntry {
  const winLocations: WinningEntry = [
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ];
  const startPos = winningLocation.start;
  const pat = winningLocation.pattern;
  for (let i = 0; i < 4; i++) {
    switch (pat) {
      case H:
        winLocations[i] = [startPos[0], startPos[1] + i];
        break;
      case V:
        winLocations[i] = [startPos[0] + i, startPos[1]];
        break;
      case SE:
        winLocations[i] = [startPos[0] + i, startPos[1] + i];
        break;
      case SW:
        winLocations[i] = [startPos[0] + i, startPos[1] - i];
        break;
      default:
        throw Error("Unknown Pattern Given, unable to build winning entry");
    }
  }
  return winLocations;
}

export const connect4Logic: GameLogic<Connect4State, Connect4View> = {
  minPlayers: 2,
  maxPlayers: 2,

  start: () => {
    const startBoard: Connect4Board = [];
    for (let i = 0; i < 6; i++) {
      const row: Connect4Row = [".", ".", ".", ".", ".", ".", "."];
      startBoard.push(row);
    }
    return { board: startBoard, nextPlayer: 0 };
  },

  update: (state, payload, playerIndex) => {
    if (!validateInputs(state, playerIndex)) {
      return null;
    }
    const srcBoard = state.board;
    if (typeof payload !== "number" || payload < 0 || payload >= srcBoard[0]?.length) {
      return null;
    }
    if (connect4Logic.isDone(state)) {
      return null;
    }
    let lowestRow: number = srcBoard.length - 1;
    while (lowestRow >= 0) {
      if (srcBoard[lowestRow][payload] !== ".") {
        if (lowestRow === 0) {
          return null;
        }
        lowestRow = lowestRow - 1;
      } else {
        break;
      }
    }
    // Clone the board instead of mutating in place: game.service captures
    // `stateBeforeMove` by reference before calling update, so an in-place
    // write would make the archived "before" snapshot alias the post-move
    // board.
    const board = srcBoard.map((row) => [...row]);
    const piece: Connect4Entry = state.nextPlayer === 0 ? "R" : "Y";
    board[lowestRow][payload] = piece;
    return { board, nextPlayer: state.nextPlayer * -1 + 1 };
  },

  isDone: (state) => {
    if (!validateInputs(state, null)) {
      return false;
    }
    return winFullSweep(state) !== null;
  },

  viewAs: (state) => {
    if (!validateInputs(state, null)) {
      return { winningEntry: null, board: state.board, nextPlayer: state.nextPlayer };
    }
    const winningLocation = winFullSweep(state);
    if (winningLocation !== null && winningLocation.pattern !== NO_EMPTY) {
      return {
        winningEntry: buildWinningEntry(winningLocation),
        board: state.board,
        nextPlayer: state.nextPlayer,
      };
    }
    return { winningEntry: null, board: state.board, nextPlayer: state.nextPlayer };
  },

  tagView: (view) => ({ type: "connect4", view }),

  // Winner = owner of the winning disc. Only called when isDone is true; a
  // full board with no line (pattern NO_EMPTY) is a draw → null.
  winnerIndex: (state) => {
    const win = winFullSweep(state);
    if (win === null || win.pattern === NO_EMPTY) return null;
    const [r, c] = win.start;
    return state.board[r][c] === "R" ? 0 : 1;
  },

  parseMove: (payload) => {
    const move = zConnect4Move.safeParse(payload);
    return move.success ? move.data : null;
  },

  // a winning move is one that drops a disc and completes four in a row
  isWinningMove: (state, payload) => {
    const mover = state.nextPlayer;
    const updated = connect4Logic.update(state, payload, mover);
    if (updated === null) return false;
    return connect4Logic.isDone(updated) && connect4Logic.winnerIndex!(updated) === mover;
  },
};

export const connect4GameService = new GameService<Connect4State, Connect4View>(connect4Logic);
