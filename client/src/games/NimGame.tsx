import "./NimGame.css";
import { useEffect, useRef, useState } from "react";
import type { NimMove, NimView } from "@gamenite/shared";
import type { GameProps } from "../util/types.ts";
import { deriveAiTake } from "./aiMoveFlash.ts";

/** How long the AI's picked button stays highlighted. */
const AI_FLASH_MS = 1400;

export default function NimGame({
  view,
  players,
  userPlayerIndex,
  makeMove,
}: GameProps<NimView, NimMove>) {
  const disabled = userPlayerIndex !== view.nextPlayer;
  const hasAiSeat = players.some((p) => p.isAi);

  // Flash the button the model "pressed": each new view is compared with
  // the previous one; if an AI seat moved, its take lights up briefly.
  const prevView = useRef<NimView | null>(null);
  const [aiTake, setAiTake] = useState<number | null>(null);
  useEffect(() => {
    const picked = deriveAiTake(prevView.current, view, players);
    prevView.current = view;
    if (!picked) return undefined;
    setAiTake(picked.take);
    const timer = setTimeout(() => setAiTake(null), AI_FLASH_MS);
    return () => clearTimeout(timer);
  }, [view, players]);

  const moveButtonClass = (take: number) =>
    `secondary narrow${aiTake === take ? " ai-picked" : ""}`;

  /** Player's name */
  function playerDisplay(index: number) {
    return index === userPlayerIndex ? "you" : players[index].display;
  }

  /** Possessive form of player's name */
  function playerPoss(index: number) {
    return index === userPlayerIndex ? "your" : `${players[index].display}'s`;
  }

  return (
    <div className="content spacedSection">
      <div>
        The game of Nim is played as follows:
        <ol>
          <li>The game starts with a pile of objects. </li>
          <li>Players take turns removing objects from the pile. </li>
          <li>On their turn, a player must remove 1, 2, or 3 objects from the pile. </li>
          <li>The player who removes the last object loses the game. </li>
        </ol>
        Think strategically and try to force your opponent into a losing position!
      </div>
      <hr />
      <h2>Current game</h2>
      <div>
        There are {view.remaining} object{view.remaining !== 1 && "s"} left in the pile.
      </div>
      {view.remaining > 0 && <div>Currently it is {playerPoss(view.nextPlayer)} turn</div>}
      {view.remaining === 0 && (
        <div>
          The game is over: {playerDisplay(view.nextPlayer)} won by forcing{" "}
          {playerDisplay(1 - view.nextPlayer)} to take the last object.
        </div>
      )}
      {(userPlayerIndex >= 0 || hasAiSeat) && (
        <div style={{ display: "flex", flexDirection: "row", gap: "0.5rem" }}>
          <button
            className={moveButtonClass(1)}
            disabled={disabled || view.remaining < 1}
            onClick={() => makeMove(1)}
            data-testid="nim-take-1"
          >
            Take one
          </button>
          <button
            disabled={disabled || view.remaining < 2}
            className={moveButtonClass(2)}
            onClick={() => makeMove(2)}
            data-testid="nim-take-2"
          >
            Take two
          </button>
          <button
            disabled={disabled || view.remaining < 3}
            className={moveButtonClass(3)}
            onClick={() => makeMove(3)}
            data-testid="nim-take-3"
          >
            Take three
          </button>
        </div>
      )}
    </div>
  );
}
