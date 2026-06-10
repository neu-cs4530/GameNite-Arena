import "./NimReplayView.css";
import type { NimView } from "@gamenite/shared";
import type { MatchParticipantView } from "../../util/types.ts";
import type { JSX } from "react";

interface NimReplayViewProps {
  view: NimView;
  participants: MatchParticipantView[];
  /** Total starting pile size — used to size the row of tokens. */
  startingPile?: number;
}

const TOKEN_LIMIT = 30;

/**
 * Read-only Nim board for replays. Renders the remaining tokens as a row of
 * dots; participants and "next to move" prompt sit above.
 */
export default function NimReplayView({
  view,
  participants,
  startingPile = 21,
}: NimReplayViewProps): JSX.Element {
  const total = Math.min(startingPile, TOKEN_LIMIT);
  const taken = total - view.remaining;
  const players = participants;
  const nextPlayer = players[view.nextPlayer];

  return (
    <div className="ga-nim-replay" data-testid="game-board-nim">
      <div className="ga-nim-replay__meta">
        <div className="ga-nim-replay__remaining">
          <span className="ga-nim-replay__remaining-num">{view.remaining}</span>
          <span className="ga-nim-replay__remaining-label">tokens left</span>
        </div>
        {view.remaining > 0 ? (
          <div className="ga-nim-replay__turn">
            Next to move: <strong>{nextPlayer?.displayName ?? "—"}</strong>
          </div>
        ) : (
          <div className="ga-nim-replay__turn">
            Game over — {players[view.nextPlayer]?.displayName} forced to take the last token.
          </div>
        )}
      </div>
      <div className="ga-nim-replay__pile" aria-hidden="true">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`ga-nim-replay__token ${i < taken ? "ga-nim-replay__token--taken" : ""}`}
          />
        ))}
      </div>
    </div>
  );
}
