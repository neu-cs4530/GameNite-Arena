import "./Connect4Game.css";
import { useEffect, useRef, useState } from "react";
import type { Connect4Move, Connect4View } from "@gamenite/shared";
import type { GameProps } from "../util/types.ts";

const ROWS = 6;
const COLS = 7;

/** How long the AI's dropped column stays highlighted. */
const AI_FLASH_MS = 1400;

/**
 * Compare the previous and current views to figure out which column an AI seat
 * just dropped in, so we can flash that drop control briefly. Returns the
 * column index, or null if the change wasn't an AI move (or no change at all).
 */
function deriveAiDrop(
  prev: Connect4View | null,
  next: Connect4View,
  aiMoved: boolean,
): number | null {
  if (!prev || !aiMoved) return null;
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      if (prev.board[row][col] === "." && next.board[row][col] !== ".") {
        return col;
      }
    }
  }
  return null;
}

export default function Connect4Game({
  view,
  players,
  userPlayerIndex,
  makeMove,
}: GameProps<Connect4View, Connect4Move>) {
  const isWatcher = userPlayerIndex < 0;
  const notYourTurn = userPlayerIndex !== view.nextPlayer;
  const gameOver = view.winningEntry !== null;
  const hasAiSeat = players.some((p) => p.isAi);

  /** A column is full when its top cell (row 0) is occupied. */
  const columnFull = (col: number) => view.board[0][col] !== ".";

  /** Whether the viewer may drop in this column right now. */
  const canDrop = (col: number) => !isWatcher && !notYourTurn && !gameOver && !columnFull(col);

  const isWinner = (row: number, col: number) =>
    view.winningEntry?.some(([wr, wc]) => wr === row && wc === col) ?? false;

  // Flash the column the model "dropped": each new view is compared with the
  // previous one; if an AI seat moved, that column lights up briefly.
  const prevView = useRef<Connect4View | null>(null);
  const prevNext = useRef<number>(view.nextPlayer);
  const [aiDrop, setAiDrop] = useState<number | null>(null);
  useEffect(() => {
    // An AI seat just moved if the previous mover (whose turn it was) is AI.
    const moverIndex = prevNext.current;
    const moverWasAi = players[moverIndex]?.isAi === true;
    const picked = deriveAiDrop(prevView.current, view, moverWasAi);
    prevView.current = view;
    prevNext.current = view.nextPlayer;
    if (picked === null) return undefined;
    setAiDrop(picked);
    const timer = setTimeout(() => setAiDrop(null), AI_FLASH_MS);
    return () => clearTimeout(timer);
  }, [view, players]);

  /** Player's name (current viewer reads as "you"). */
  function playerDisplay(index: number) {
    return index === userPlayerIndex ? "you" : (players[index]?.display ?? "—");
  }

  /** Possessive form of player's name. */
  function playerPoss(index: number) {
    return index === userPlayerIndex ? "your" : `${players[index]?.display ?? "—"}'s`;
  }

  const showControls = !isWatcher || hasAiSeat;

  return (
    <div className="content spacedSection">
      <div>
        Connect 4 is played on a 7-column, 6-row grid:
        <ol>
          <li>Players take turns dropping a disc into one of the columns.</li>
          <li>Each disc falls to the lowest empty slot in that column.</li>
          <li>The first player to line up four discs in a row wins.</li>
          <li>Four in a row can be horizontal, vertical, or diagonal.</li>
        </ol>
        Red ({playerDisplay(0)}) moves first; Yellow ({playerDisplay(1)}) moves second.
      </div>
      <hr />
      <h2>Current game</h2>
      {!gameOver && <div>Currently it is {playerPoss(view.nextPlayer)} turn</div>}
      {gameOver && (
        <div>The game is over: {playerDisplay(1 - view.nextPlayer)} won with four in a row.</div>
      )}

      <div className="c4-stage">
        {/* Drop controls: a 7-column grid aligned 1:1 with the board so the
            row can never overflow the board's width. */}
        {showControls && (
          <div className="c4-drops" role="group" aria-label="Drop a disc">
            {Array.from({ length: COLS }).map((_, col) => (
              <button
                key={col}
                type="button"
                className={`c4-drop${aiDrop === col ? " c4-drop--ai" : ""}`}
                disabled={!canDrop(col)}
                onClick={() => makeMove(col)}
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

        {/* The board itself: a 7-column grid in an aspect-ratio'd wrapper. */}
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
