import "./TicTacToeReplayView.css";
import type { TicTacEntry, TicTacToeView } from "@gamenite/shared";
import type { MatchParticipantView } from "../../util/types.ts";
import type { JSX } from "react";

interface TicTacToeReplayViewProps {
  view: TicTacToeView;
  participants: MatchParticipantView[];
  /** When set, empty cells become clickable buttons (for puzzles). */
  onCellClick?: (row: number, col: number) => void;
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
}: TicTacToeReplayViewProps): JSX.Element {
  const gameOver = view.winningEntry !== null;
  const winnerIndex = 1 - view.nextPlayer; // whoever just moved
  const nextName = participants[view.nextPlayer]?.displayName ?? "—";
  const winnerName = participants[winnerIndex]?.displayName ?? "—";
  const me: TicTacEntry = view.nextPlayer === 0 ? "O" : "X";

  const isWinningCell = (row: number, col: number) =>
    view.winningEntry?.some(([winRow, winCol]) => winRow === row && winCol === col) ?? false;

  function renderMark(entry: TicTacEntry) {
    if (entry === ".") return null;
    const markClass = entry === "O" ? "ttt-mark ttt-mark--o" : "ttt-mark ttt-mark--x";
    return <span className={markClass}>{entry}</span>;
  }

  // a placed mark, or (if playable) a move button
  function renderCell(row: number, col: number, entry: TicTacEntry) {
    const cellClass = `ttt-cell${isWinningCell(row, col) ? " ttt-cell--winner" : ""}`;
    const testId = `ttt-cell-${row}-${col}`;

    if (entry !== "." || gameOver || onCellClick === undefined) {
      return (
        <div className={cellClass} key={testId} data-testid={testId}>
          {renderMark(entry)}
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
