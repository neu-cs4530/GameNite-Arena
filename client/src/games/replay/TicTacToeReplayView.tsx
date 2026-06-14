import "./TicTacToeReplayView.css";
import type { TicTacEntry, TicTacToeView } from "@gamenite/shared";
import type { MatchParticipantView } from "../../util/types.ts";
import type { JSX } from "react";

interface TicTacToeReplayViewProps {
  view: TicTacToeView;
  participants: MatchParticipantView[];
}

/**
 * Read-only Tic-Tac-Toe board for replays. Same responsive board as the live
 * game (square wrapper + 3x3 fractional grid, marks sized in cqw) but with no
 * buttons — it's driven entirely by the view the reducer produces while
 * stepping through archived moves. Player 0 = O, player 1 = X.
 */
export default function TicTacToeReplayView({
  view,
  participants,
}: TicTacToeReplayViewProps): JSX.Element {
  const gameOver = view.winningEntry !== null;
  const winnerIndex = 1 - view.nextPlayer; // whoever just moved
  const nextName = participants[view.nextPlayer]?.displayName ?? "—";
  const winnerName = participants[winnerIndex]?.displayName ?? "—";

  const isWinningCell = (row: number, col: number) =>
    view.winningEntry?.some(([winRow, winCol]) => winRow === row && winCol === col) ?? false;

  function renderMark(entry: TicTacEntry) {
    if (entry === ".") return null;
    const markClass = entry === "O" ? "ttt-mark ttt-mark--o" : "ttt-mark ttt-mark--x";
    return <span className={markClass}>{entry}</span>;
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
        {view.board.map((entries, row) =>
          entries.map((entry, col) => (
            <div
              className={`ttt-cell${isWinningCell(row, col) ? " ttt-cell--winner" : ""}`}
              key={`${row}-${col}`}
              data-testid={`ttt-cell-${row}-${col}`}
            >
              {renderMark(entry)}
            </div>
          )),
        )}
      </div>
    </div>
  );
}
