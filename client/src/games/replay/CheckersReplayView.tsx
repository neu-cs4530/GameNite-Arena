import "./CheckersReplayView.css";
import { useState, type JSX } from "react";
import type { CheckersEntry, CheckersMove, CheckersView } from "@gamenite/shared";
import type { MatchParticipantView } from "../../util/types.ts";

type Cell = [number, number];

interface CheckersReplayViewProps {
  view: CheckersView;
  participants: MatchParticipantView[];
  /** When set, lets the side to move click a piece then a destination (for puzzles). */
  onMove?: (move: CheckersMove) => void;
}

/**
 * Checkers board for replays and puzzles. Same fluid 8x8 grid as the live
 * `CheckersGame`. Read-only unless `onMove` is given, in which case it
 * supports the same select-then-click moves as the live game.
 */
export default function CheckersReplayView({
  view,
  participants,
  onMove,
}: CheckersReplayViewProps): JSX.Element {
  const [selected, setSelected] = useState<Cell | null>(null);
  const red = participants[0];
  const black = participants[1];

  // squares whose pieces have at least one legal move
  const movablePieces = new Set(
    view.legalMoves.map((m) => `${m.squares[0][0]},${m.squares[0][1]}`),
  );

  // end squares reachable from the selected piece
  const legalDestKeys = new Set(
    selected
      ? view.legalMoves
          .filter((m) => m.squares[0][0] === selected[0] && m.squares[0][1] === selected[1])
          .map((m) => {
            const end = m.squares[m.squares.length - 1];
            return `${end[0]},${end[1]}`;
          })
      : [],
  );

  // "your" pieces are whoever's turn it is in this position
  function isOwnPiece(cell: CheckersEntry): boolean {
    if (view.nextPlayer === 0) return cell === "R" || cell === "RK";
    return cell === "B" || cell === "BK";
  }

  // the legal move from `selected` to (row, col), if one exists
  function chainTo(row: number, col: number) {
    if (!selected) return null;
    return (
      view.legalMoves.find((m) => {
        const start = m.squares[0];
        const end = m.squares[m.squares.length - 1];
        return (
          start[0] === selected[0] && start[1] === selected[1] && end[0] === row && end[1] === col
        );
      }) ?? null
    );
  }

  function handleClick(row: number, col: number) {
    if (onMove === undefined) return;

    // clicked a highlighted destination -> submit the move
    if (selected && legalDestKeys.has(`${row},${col}`)) {
      const chain = chainTo(row, col);
      if (chain) onMove({ squares: chain.squares });
      setSelected(null);
      return;
    }

    // clicked a movable piece -> select it
    const cell = view.board[row][col];
    if (isOwnPiece(cell) && movablePieces.has(`${row},${col}`)) {
      setSelected([row, col]);
      return;
    }

    setSelected(null);
  }

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
              const isSelected = selected?.[0] === r && selected?.[1] === c;
              const isLegalDest = legalDestKeys.has(`${r},${c}`);
              const isMovable = isOwnPiece(cell) && movablePieces.has(`${r},${c}`);
              const clickable = onMove !== undefined && (isLegalDest || isMovable);

              const classes = [
                "ga-ch-replay__square",
                isDark ? "ga-ch-replay__square--dark" : "ga-ch-replay__square--light",
                isSelected && "ga-ch-replay__square--selected",
                isLegalDest && "ga-ch-replay__square--dest",
                isMovable && "ga-ch-replay__square--movable",
                clickable && "ga-ch-replay__square--clickable",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <div
                  key={`${r}-${c}`}
                  className={classes}
                  onClick={() => handleClick(r, c)}
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
