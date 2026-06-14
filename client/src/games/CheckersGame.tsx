import "./CheckersGame.css";
import { useState } from "react";
import type { CheckersEntry, CheckersMove, CheckersView } from "@gamenite/shared";
import type { GameProps } from "../util/types.ts";

type Cell = [number, number];

/**
 * Live Checkers board.
 *
 * Stateful two-click UX ported from the IP2 client: click one of your movable
 * pieces to select it (highlighted), then click a highlighted destination to
 * submit the full move sequence. The set of selectable pieces and reachable
 * destinations is driven entirely by `view.legalMoves`, so mandatory-capture
 * and king multi-capture rules are enforced by the server engine, not here.
 *
 * Watchers (`userPlayerIndex < 0`) and the off-turn player get a read-only
 * board: clicks are ignored and nothing is highlighted as actionable.
 *
 * The board is a fluid 8x8 CSS grid sized to its column (never fixed px), so
 * it can render in a half-width live column without clipping.
 */
export default function CheckersGame({
  view,
  players,
  userPlayerIndex,
  makeMove,
}: GameProps<CheckersView, CheckersMove>) {
  const [selected, setSelected] = useState<Cell | null>(null);

  const isWatcher = userPlayerIndex < 0;
  const gameOver = view.winner !== null;
  const myTurn = !isWatcher && !gameOver && userPlayerIndex === view.nextPlayer;

  // Squares whose pieces have at least one legal move available.
  const movablePieces = new Set(
    view.legalMoves.map((m) => `${m.squares[0][0]},${m.squares[0][1]}`),
  );

  // End squares reachable from the currently selected piece.
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

  function isOwnPiece(cell: CheckersEntry) {
    if (userPlayerIndex === 0) return cell === "R" || cell === "RK";
    if (userPlayerIndex === 1) return cell === "B" || cell === "BK";
    return false;
  }

  // Find the move whose start matches `selected` and whose end is (row, col).
  // If multiple chains share the same endpoint, picks the first.
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
    // Watchers and post-game clicks never send a move.
    if (!myTurn) return;

    // Clicked a highlighted legal destination -> submit full sequence + clear.
    if (selected && legalDestKeys.has(`${row},${col}`)) {
      const chain = chainTo(row, col);
      if (chain) {
        makeMove({ squares: chain.squares });
        setSelected(null);
      }
      return;
    }

    // Clicked own piece that has legal moves -> select it.
    const cell = view.board[row][col];
    if (isOwnPiece(cell) && movablePieces.has(`${row},${col}`)) {
      setSelected([row, col]);
      return;
    }

    setSelected(null);
  }

  function isSelectable(row: number, col: number) {
    if (!myTurn) return false;
    if (legalDestKeys.has(`${row},${col}`)) return true;
    return isOwnPiece(view.board[row][col]) && movablePieces.has(`${row},${col}`);
  }

  function statusMessage() {
    if (gameOver) {
      if (isWatcher) return view.winner === 0 ? "Red wins!" : "Black wins!";
      return view.winner === userPlayerIndex ? "You won!" : "You lost!";
    }
    if (myTurn) return "Your turn";
    return `${players[view.nextPlayer]?.display ?? "Opponent"}'s turn`;
  }

  return (
    <div className="content spacedSection ch-game">
      <h2>Checkers</h2>
      <div className="ch-status" data-testid="checkers-status">
        {statusMessage()}
      </div>

      <div className="ch-board-wrap">
        <div className="ch-board" role="grid" data-testid="checkers-board">
          {view.board.map((row, r) =>
            row.map((cell, c) => {
              const isDark = (r + c) % 2 === 1;
              const isSelected = selected?.[0] === r && selected?.[1] === c;
              const isLegalDest = legalDestKeys.has(`${r},${c}`);
              const isMovable = myTurn && isOwnPiece(cell) && movablePieces.has(`${r},${c}`);

              const classes = [
                "ch-square",
                isDark ? "ch-square--dark" : "ch-square--light",
                isSelected && "ch-square--selected",
                isLegalDest && "ch-square--dest",
                isMovable && "ch-square--movable",
                isSelectable(r, c) && "ch-square--clickable",
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
                  {cell === "R" && <div className="ch-piece ch-piece--red" />}
                  {cell === "B" && <div className="ch-piece ch-piece--black" />}
                  {cell === "RK" && (
                    <div className="ch-piece ch-piece--red ch-piece--king">
                      <span className="ch-crown">♛</span>
                    </div>
                  )}
                  {cell === "BK" && (
                    <div className="ch-piece ch-piece--black ch-piece--king">
                      <span className="ch-crown">♛</span>
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
