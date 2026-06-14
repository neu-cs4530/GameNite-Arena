import "./TicTacToeGame.css";
import type { TicTacEntry, TicTacToeMove, TicTacToeView } from "@gamenite/shared";
import type { GameProps } from "../util/types.ts";

/**
 * Live, interactive Tic-Tac-Toe board.
 *
 * Seat convention (from the shared types): player 0 plays `O`, player 1 plays
 * `X`. Watchers have `userPlayerIndex === -1` and never see playable cells.
 *
 * The board is a responsive CSS grid inside a square (aspect-ratio'd) wrapper,
 * so it scales down cleanly in a half-width column without ever clipping —
 * cells are fractional (1fr) and marks are sized relative to the cell.
 */
export default function TicTacToeGame({
  view,
  players,
  userPlayerIndex,
  makeMove,
}: GameProps<TicTacToeView, TicTacToeMove>) {
  const isWatcher = userPlayerIndex === -1;
  const myTurn = !isWatcher && userPlayerIndex === view.nextPlayer;
  const gameOver = view.winningEntry !== null;
  const me: TicTacEntry = userPlayerIndex === 0 ? "O" : "X";

  const isWinningCell = (row: number, col: number) =>
    view.winningEntry?.some(([winRow, winCol]) => winRow === row && winCol === col) ?? false;

  /** A player's name, or "you" / "your" for the viewer. */
  function playerDisplay(index: number) {
    return index === userPlayerIndex ? "you" : (players[index]?.display ?? `Player ${index + 1}`);
  }
  function playerPoss(index: number) {
    return index === userPlayerIndex
      ? "your"
      : `${players[index]?.display ?? `Player ${index + 1}`}'s`;
  }

  /** Renders one cell: a placed mark, an empty disabled cell, or a move button. */
  function renderCell(row: number, col: number, entry: TicTacEntry) {
    const winning = isWinningCell(row, col);
    const cellClass = `ttt-cell${winning ? " ttt-cell--winner" : ""}`;
    const testId = `ttt-cell-${row}-${col}`;

    if (entry !== ".") {
      const markClass = entry === "O" ? "ttt-mark ttt-mark--o" : "ttt-mark ttt-mark--x";
      return (
        <div className={cellClass} key={col} data-testid={testId}>
          <span className={markClass}>{entry}</span>
        </div>
      );
    }

    // Empty cell. Only a clickable button when it's the viewer's turn and the
    // game is still live; otherwise a plain (non-interactive) cell.
    const playable = myTurn && !gameOver;
    if (!playable) {
      return <div className={cellClass} key={col} data-testid={testId} />;
    }
    return (
      <button
        type="button"
        className={`${cellClass} ttt-cell--playable`}
        key={col}
        data-testid={testId}
        aria-label={`Place ${me} at row ${row + 1}, column ${col + 1}`}
        onClick={() => makeMove([row, col])}
      >
        <span className="ttt-mark ttt-mark--ghost">{me}</span>
      </button>
    );
  }

  return (
    <div className="content spacedSection">
      <div>
        Tic-Tac-Toe: get three of your marks in a row — horizontally, vertically, or diagonally —
        before your opponent does. Player one plays <strong>X</strong>; player two plays{" "}
        <strong>O</strong>.
      </div>
      <hr />
      <h2>Current game</h2>
      <div data-testid="ttt-status">
        {gameOver ? (
          <>The game is over: {playerDisplay(1 - view.nextPlayer)} won.</>
        ) : (
          <>It is {playerPoss(view.nextPlayer)} turn.</>
        )}
      </div>
      <div className="ttt-board" data-testid="ttt-board" role="grid" aria-label="Tic-Tac-Toe board">
        {view.board.map((entries, row) => entries.map((entry, col) => renderCell(row, col, entry)))}
      </div>
    </div>
  );
}
