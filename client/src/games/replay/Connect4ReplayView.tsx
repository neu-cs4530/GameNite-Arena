import "./Connect4ReplayView.css";
import type { Connect4View } from "@gamenite/shared";
import type { MatchParticipantView } from "../../util/types.ts";
import type { JSX } from "react";

interface Connect4ReplayViewProps {
  view: Connect4View;
  participants: MatchParticipantView[];
  /** When set, shows the column-drop arrows from the live game (for puzzles). */
  onColumnClick?: (col: number) => void;
  /** Column where the selected AI model would drop from this position — the
   * landing cell is highlighted green so the move is visible on the board. */
  aiMove?: number;
}

/**
 * Connect 4 board for replays and puzzles. Renders the board exactly as the
 * derived state (see connect4Reducer) produced it; participants and the
 * "next to move" prompt sit above. Same responsive grid as the live board so
 * it never clips in a narrow replay column.
 *
 * With `onColumnClick`, the live game's column-drop arrows appear above the
 * board.
 */
export default function Connect4ReplayView({
  view,
  participants,
  onColumnClick,
  aiMove,
}: Connect4ReplayViewProps): JSX.Element {
  const gameOver = view.winningEntry !== null;
  const nextPlayer = participants[view.nextPlayer];
  const columnFull = (col: number) => view.board[0][col] !== ".";

  const isWinner = (row: number, col: number) =>
    view.winningEntry?.some(([wr, wc]) => wr === row && wc === col) ?? false;

  // The cell the AI's chosen column would drop into (lowest empty row), so the
  // suggestion shows as a green ghost disc right where it would land.
  const aiLandingRow =
    aiMove !== undefined && aiMove >= 0 && aiMove < view.board[0].length && !gameOver
      ? view.board.reduce(
          (landing, rowCells, row) => (rowCells[aiMove] === "." ? row : landing),
          -1,
        )
      : -1;
  const isAiTarget = (row: number, col: number) => row === aiLandingRow && col === aiMove;

  return (
    <div className="ga-c4-replay" data-testid="game-board-connect4">
      <div className="ga-c4-replay__meta">
        <div className="ga-c4-replay__legend">
          <span className="ga-c4-replay__chip">
            <span className="c4-disc c4-disc--red" />
            {participants[0]?.displayName ?? "Red"}
          </span>
          <span className="ga-c4-replay__chip">
            <span className="c4-disc c4-disc--yellow" />
            {participants[1]?.displayName ?? "Yellow"}
          </span>
        </div>
        {gameOver ? (
          <div className="ga-c4-replay__turn">
            Game over — <strong>{participants[1 - view.nextPlayer]?.displayName ?? "—"}</strong>{" "}
            won.
          </div>
        ) : (
          <div className="ga-c4-replay__turn">
            Next to move: <strong>{nextPlayer?.displayName ?? "—"}</strong>
          </div>
        )}
      </div>

      <div className="c4-stage">
        {onColumnClick !== undefined && (
          <div className="c4-drops" role="group" aria-label="Drop a disc">
            {view.board[0].map((_, col) => (
              <button
                key={col}
                type="button"
                className="c4-drop"
                disabled={columnFull(col)}
                onClick={() => onColumnClick(col)}
                aria-label={`Drop in column ${col + 1}`}
                data-testid={`c4-col-${col}`}
              >
                <span className="c4-drop-arrow" aria-hidden="true">
                  ▾
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="c4-frame">
          <div className="c4-board" data-testid="c4-board">
            {view.board.map((entries, row) =>
              entries.map((entry, col) => (
                <span
                  className={`c4-cell${isWinner(row, col) ? " c4-cell--win" : ""}${
                    isAiTarget(row, col) ? " c4-cell--ai" : ""
                  }`}
                  key={`${row}-${col}`}
                  data-testid={isAiTarget(row, col) ? "c4-ai-target" : undefined}
                >
                  {entry !== "." ? (
                    <span
                      className={`c4-disc ${entry === "R" ? "c4-disc--red" : "c4-disc--yellow"}`}
                    />
                  ) : (
                    isAiTarget(row, col) && (
                      <span className="c4-disc c4-disc--ai" aria-label="AI would drop here" />
                    )
                  )}
                </span>
              )),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
