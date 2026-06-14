import "./Connect4ReplayView.css";
import type { Connect4View } from "@gamenite/shared";
import type { MatchParticipantView } from "../../util/types.ts";
import type { JSX } from "react";

interface Connect4ReplayViewProps {
  view: Connect4View;
  participants: MatchParticipantView[];
}

/**
 * Read-only Connect 4 board for replays. Renders the board exactly as the
 * derived state (see connect4Reducer) produced it; participants and the
 * "next to move" prompt sit above. Same responsive grid as the live board so
 * it never clips in a narrow replay column.
 */
export default function Connect4ReplayView({
  view,
  participants,
}: Connect4ReplayViewProps): JSX.Element {
  const gameOver = view.winningEntry !== null;
  const nextPlayer = participants[view.nextPlayer];

  const isWinner = (row: number, col: number) =>
    view.winningEntry?.some(([wr, wc]) => wr === row && wc === col) ?? false;

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
        <div className="c4-frame">
          <div className="c4-board" data-testid="c4-board">
            {view.board.map((entries, row) =>
              entries.map((entry, col) => (
                <span
                  className={`c4-cell${isWinner(row, col) ? " c4-cell--win" : ""}`}
                  key={`${row}-${col}`}
                >
                  {entry !== "." && (
                    <span
                      className={`c4-disc ${entry === "R" ? "c4-disc--red" : "c4-disc--yellow"}`}
                    />
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
