import "./CheckersReplayView.css";
import type { CheckersView } from "@gamenite/shared";
import type { MatchParticipantView } from "../../util/types.ts";
import type { JSX } from "react";

interface CheckersReplayViewProps {
  view: CheckersView;
  participants: MatchParticipantView[];
}

/**
 * Read-only Checkers board for replays. Same fluid 8x8 grid as the live
 * `CheckersGame`, but with no selection / click handling — it just renders the
 * board state derived by `checkersReducer` at the current move index.
 */
export default function CheckersReplayView({
  view,
  participants,
}: CheckersReplayViewProps): JSX.Element {
  const red = participants[0];
  const black = participants[1];

  function statusLine(): string {
    if (view.winner === 0) return `${red?.displayName ?? "Red"} (Red) wins`;
    if (view.winner === 1) return `${black?.displayName ?? "Black"} (Black) wins`;
    const next = participants[view.nextPlayer];
    const side = view.nextPlayer === 0 ? "Red" : "Black";
    return `Next to move: ${next?.displayName ?? side} (${side})`;
  }

  return (
    <div className="ga-ch-replay" data-testid="game-board-checkers">
      <div className="ga-ch-replay__meta">
        <div className="ga-ch-replay__players">
          <span className="ga-ch-replay__player">
            <span className="ga-ch-replay__chip ga-ch-replay__chip--red" aria-hidden="true" />
            {red?.displayName ?? "Red"}
          </span>
          <span className="ga-ch-replay__vs">vs</span>
          <span className="ga-ch-replay__player">
            <span className="ga-ch-replay__chip ga-ch-replay__chip--black" aria-hidden="true" />
            {black?.displayName ?? "Black"}
          </span>
        </div>
        <div className="ga-ch-replay__turn">{statusLine()}</div>
      </div>

      <div className="ga-ch-replay__board-wrap">
        <div className="ga-ch-replay__board" role="grid" data-testid="checkers-board">
          {view.board.map((row, r) =>
            row.map((cell, c) => {
              const isDark = (r + c) % 2 === 1;
              const classes = [
                "ga-ch-replay__square",
                isDark ? "ga-ch-replay__square--dark" : "ga-ch-replay__square--light",
              ].join(" ");
              return (
                <div
                  key={`${r}-${c}`}
                  className={classes}
                  role="gridcell"
                  aria-label={`square ${r},${c}`}
                  data-testid={`checkers-sq-${r}-${c}`}
                >
                  {cell === "R" && <div className="ga-ch-replay__piece ga-ch-replay__piece--red" />}
                  {cell === "B" && (
                    <div className="ga-ch-replay__piece ga-ch-replay__piece--black" />
                  )}
                  {cell === "RK" && (
                    <div className="ga-ch-replay__piece ga-ch-replay__piece--red ga-ch-replay__piece--king">
                      <span className="ga-ch-replay__crown">♛</span>
                    </div>
                  )}
                  {cell === "BK" && (
                    <div className="ga-ch-replay__piece ga-ch-replay__piece--black ga-ch-replay__piece--king">
                      <span className="ga-ch-replay__crown">♛</span>
                    </div>
                  )}
                </div>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}
