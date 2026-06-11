import "./StubReplayView.css";
import type { JSX } from "react";

interface StubReplayViewProps {
  gameLabel: string;
  body?: string;
}

/**
 * Generic placeholder used for game keys whose replay viewer hasn't been
 * built yet (Checkers, Connect 4, Tic-Tac-Toe). Renders the game label so
 * the rest of the viewer (move list, annotations, etc.) still works.
 */
export default function StubReplayView({ gameLabel, body }: StubReplayViewProps): JSX.Element {
  return (
    <div className="ga-stub-replay" data-testid="game-board-stub" role="status">
      <div className="ga-stub-replay__title">{gameLabel} replay viewer</div>
      <div className="ga-stub-replay__body">
        {body ??
          "This game's replay view is on the roadmap. The replay metadata, move list, and annotations work in the meantime."}
      </div>
    </div>
  );
}
