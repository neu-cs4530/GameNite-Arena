import "./TicTacToeReplayView.css";
import type { TicTacEntry, TicTacToeView } from "@gamenite/shared";
import type { MatchParticipantView } from "../../util/types.ts";
import type { JSX } from "react";

interface TicTacToeReplayViewProps {
  view: TicTacToeView;
  participants: MatchParticipantView[];
  /** When set, empty cells become clickable buttons (for puzzles). */
  onCellClick?: (row: number, col: number) => void;
  /** Cell [row, col] the selected AI model would play from this position —
   * highlighted green so the move is visible on the board. */
  aiMove?: [number, number];
  /** The built-in engine's verdict on the move that PRODUCED this position: its
   * cell is tinted by quality (green best / amber inaccuracy / red blunder) so
   * the analysis is visible on the board. */
  engineMoveQuality?: {
    move: [number, number];
    flag: "best" | "blunder" | "inaccuracy" | "neutral";
  };
}

/**
 * Tic-Tac-Toe board for replays and puzzles. Same responsive board as the
 * live game. Read-only unless `onCellClick` is given, in which case empty
 * cells become playable buttons. Player 0 = O, player 1 = X.
 */
export default function TicTacToeReplayView({
  view,
  participants,
  onCellClick,
  aiMove,
  engineMoveQuality,
}: TicTacToeReplayViewProps): JSX.Element {
  const gameOver = view.winningEntry !== null;
  const winnerIndex = 1 - view.nextPlayer; // whoever just moved
  const nextName = participants[view.nextPlayer]?.displayName ?? "—";
  const winnerName = participants[winnerIndex]?.displayName ?? "—";
  const me: TicTacEntry = view.nextPlayer === 0 ? "O" : "X";

  const isWinningCell = (row: number, col: number) =>
    view.winningEntry?.some(([winRow, winCol]) => winRow === row && winCol === col) ?? false;

  // The empty cell the AI would play from this position — shown as a green
  // ghost mark so the suggestion is visible directly on the board.
  const isAiTarget = (row: number, col: number) =>
    !gameOver && aiMove?.[0] === row && aiMove[1] === col && view.board[row][col] === ".";

  // Tint the cell of the move the engine just judged, by its quality.
  const engineQualityClass = (row: number, col: number): string => {
    if (
      engineMoveQuality === undefined ||
      engineMoveQuality.flag === "neutral" ||
      engineMoveQuality.move[0] !== row ||
      engineMoveQuality.move[1] !== col
    ) {
      return "";
    }
    return ` ttt-cell--eng-${engineMoveQuality.flag}`;
  };

  function renderMark(entry: TicTacEntry) {
    if (entry === ".") return null;
    const markClass = entry === "O" ? "ttt-mark ttt-mark--o" : "ttt-mark ttt-mark--x";
    return <span className={markClass}>{entry}</span>;
  }

  // a placed mark, or (if playable) a move button
  function renderCell(row: number, col: number, entry: TicTacEntry) {
    const cellClass = `ttt-cell${isWinningCell(row, col) ? " ttt-cell--winner" : ""}${
      isAiTarget(row, col) ? " ttt-cell--ai" : ""
    }${engineQualityClass(row, col)}`;
    const testId = `ttt-cell-${row}-${col}`;

    if (entry !== "." || gameOver || onCellClick === undefined) {
      return (
        <div className={cellClass} key={testId} data-testid={testId}>
          {entry !== "." ? (
            renderMark(entry)
          ) : isAiTarget(row, col) ? (
            <span className="ttt-mark ttt-mark--ai" data-testid="ttt-ai-target">
              {me}
            </span>
          ) : null}
        </div>
      );
    }

    return (
      <button
        type="button"
        className={`${cellClass} ttt-cell--playable`}
        key={testId}
        data-testid={testId}
        aria-label={`Place ${me} at row ${row + 1}, column ${col + 1}`}
        onClick={() => onCellClick(row, col)}
      >
        <span className="ttt-mark ttt-mark--ghost">{me}</span>
      </button>
    );
  }

  return (
    <div className="ga-ttt-replay" data-testid="game-board-tictactoe">
      <div className="ga-ttt-replay__meta">
        {gameOver ? (
          <div className="ga-ttt-replay__turn">
            Game over — <strong>{winnerName}</strong> won.
          </div>
        ) : (
          <div className="ga-ttt-replay__turn">
            Next to move: <strong>{nextName}</strong>
          </div>
        )}
      </div>
      <div className="ttt-board" data-testid="ttt-board" role="grid" aria-label="Tic-Tac-Toe board">
        {view.board.map((entries, row) => entries.map((entry, col) => renderCell(row, col, entry)))}
      </div>
    </div>
  );
}
