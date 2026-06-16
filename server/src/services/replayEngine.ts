import { ENGINE_SOLVABLE_GAME_KEYS, type GameKey, zTicTacToeMove } from "@gamenite/shared";
import { minimaxOutcome, ticTacToeLogic } from "../games/tictactoe.ts";

/** One position's verdict from the built-in perfect-play engine. */
export interface EngineVerdict {
  flag: "best" | "blunder" | "inaccuracy" | "neutral";
  confidence: number;
  notes?: string;
  /** The engine's preferred move, set only when it differs from the played one. */
  suggestedMove?: unknown;
}

// Misère nim (take 1-3): leaving the opponent at remaining % 4 === 1 always
// loses for them, so the winning take is (remaining - 1) % 4 — or none when
// we're already standing on a losing pile.
function nimWinningTake(remaining: number): number | null {
  const take = (remaining - 1) % 4;
  return take === 0 ? null : take;
}

function analyzeNimMove(state: unknown, playedMove: unknown): EngineVerdict {
  const { remaining } = state as { remaining: number };
  const winningTake = nimWinningTake(remaining);
  if (winningTake === null) {
    return {
      flag: "neutral",
      confidence: 1,
      notes: "Already a lost position — no take leaves the opponent a losing pile.",
    };
  }
  if (playedMove === winningTake) return { flag: "best", confidence: 1 };
  return {
    flag: "blunder",
    confidence: 1,
    notes: `Taking ${winningTake} would have left the opponent a losing pile.`,
    suggestedMove: winningTake,
  };
}

interface TttState {
  board: ("." | "O" | "X")[][];
  nextPlayer: number;
}

function ticTacToeLegalMoves(state: TttState): [number, number][] {
  const moves: [number, number][] = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      if (state.board[row][col] === ".") moves.push([row, col]);
    }
  }
  return moves;
}

function analyzeTicTacToeMove(state: unknown, playedMove: unknown): EngineVerdict {
  const s = state as TttState;
  const mover = s.nextPlayer;

  // Score every legal move by the mover's perfect-play outcome after it.
  const scored = ticTacToeLegalMoves(s).map((move) => {
    const next = ticTacToeLogic.update(s, move, mover);
    return { move, outcome: next === null ? -1 : minimaxOutcome(next, mover) };
  });
  if (scored.length === 0) return { flag: "neutral", confidence: 1 };

  const best = Math.max(...scored.map((entry) => entry.outcome));
  const bestEntry = scored.find((entry) => entry.outcome === best)!;

  const parsed = zTicTacToeMove.safeParse(playedMove);
  const playedEntry = parsed.success
    ? scored.find((entry) => entry.move[0] === parsed.data[0] && entry.move[1] === parsed.data[1])
    : undefined;
  const playedOutcome = playedEntry ? playedEntry.outcome : -1;

  if (playedOutcome === best) return { flag: "best", confidence: 1 };
  // Worse than the best available: turning a non-loss into a loss is a blunder;
  // settling for a draw when a win was on the board is an inaccuracy.
  return {
    flag: playedOutcome === -1 ? "blunder" : "inaccuracy",
    confidence: 1,
    notes:
      playedOutcome === -1
        ? "This move loses with best play — a safe move was available."
        : "This gives up a winning line for a draw.",
    suggestedMove: bestEntry.move,
  };
}

/**
 * Move-quality verdict from the built-in perfect-play engine, for the games
 * with a closed-form / fully-solved engine (see ENGINE_SOLVABLE_GAME_KEYS: nim
 * and tic-tac-toe). Returns null for every other game, so callers fall back to
 * a neutral "no built-in engine" result.
 *
 * @param gameKey - the game the position belongs to
 * @param state - the position BEFORE the move (raw game state, with nextPlayer)
 * @param playedMove - the move actually played from that position
 */
export function analyzeClosedFormMove(
  gameKey: GameKey,
  state: unknown,
  playedMove: unknown,
): EngineVerdict | null {
  if (!ENGINE_SOLVABLE_GAME_KEYS.includes(gameKey)) return null;
  if (gameKey === "nim") return analyzeNimMove(state, playedMove);
  if (gameKey === "tictactoe") return analyzeTicTacToeMove(state, playedMove);
  return null;
}
