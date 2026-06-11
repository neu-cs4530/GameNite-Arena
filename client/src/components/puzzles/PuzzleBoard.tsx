import "./PuzzleBoard.css";
import type { JSX } from "react";
import type { GuessView, NimView } from "@gamenite/shared";
import type { PuzzlePosition } from "../../services/puzzleMapper.ts";
import type { MatchParticipantView } from "../../util/types.ts";
import NimReplayView from "../../games/replay/NimReplayView.tsx";

/**
 * Nim daily-puzzle position. Reuses the replay board (the position IS a
 * NimView), with synthetic participants so the side to move reads as "You"
 * — the solver plays the archived winner's clinching turn.
 */
function NimPuzzleBoard({ view }: { view: NimView }): JSX.Element {
  const participants: MatchParticipantView[] = [0, 1].map((index) =>
    index === view.nextPlayer
      ? { id: "puzzle-you", type: "human", displayName: "You" }
      : { id: "puzzle-opponent", type: "human", displayName: "Opponent" },
  );
  return (
    <div className="ga-puzzle-board" data-testid="puzzle-board-nim">
      {/* The puzzle is a fresh position, not a scrubbed replay — size the
          pile to what's actually left so no ghost tokens render. */}
      <NimReplayView view={view} participants={participants} startingPile={view.remaining} />
      <p className="ga-puzzle-board__framing">
        Your move — take 1, 2 or 3 tokens. Whoever takes the last token loses.
      </p>
    </div>
  );
}

/**
 * Number Guesser daily-puzzle position: the prompt context for a mid-game
 * table. The watcher view only says WHO has guessed, never the values or
 * the secret.
 */
function GuessPuzzleBoard({ view }: { view: GuessView }): JSX.Element {
  const total = view.guesses.length;
  const locked = view.finished ? total : view.guesses.filter(Boolean).length;
  return (
    <div className="ga-puzzle-board" data-testid="puzzle-board-guess">
      <div className="ga-puzzle-board__guess-context">
        <span className="ga-puzzle-board__guess-count">
          {locked} of {total}
        </span>
        <span className="ga-puzzle-board__guess-count-label">guesses locked in</span>
      </div>
      <p className="ga-puzzle-board__framing">
        The table is hunting a secret number between 1 and 100 — closest guess wins. Recreate the
        archived line: what did the next player lock in?
      </p>
    </div>
  );
}

/**
 * gameKey → board dispatch. The map is keyed by the PuzzlePosition
 * discriminant, so adding a game to the mapper without adding a board here
 * is a compile error — new games slot in with one entry.
 */
const boards: {
  [key in PuzzlePosition["kind"]]: (position: PuzzlePosition) => JSX.Element | null;
} = {
  nim: (position) => (position.kind === "nim" ? <NimPuzzleBoard view={position.view} /> : null),
  guess: (position) =>
    position.kind === "guess" ? <GuessPuzzleBoard view={position.view} /> : null,
};

/** Renders the per-game presentational board for a daily puzzle position. */
export default function PuzzleBoard({ position }: { position: PuzzlePosition }): JSX.Element {
  return <>{boards[position.kind](position)}</>;
}
