import "./GuessReplayView.css";
import type { GuessView } from "@gamenite/shared";
import type { MatchParticipantView } from "../../util/types.ts";
import type { JSX } from "react";

interface GuessReplayViewProps {
  view: GuessView;
  participants: MatchParticipantView[];
}

/** Read-only Guess game replay. */
export default function GuessReplayView({ view, participants }: GuessReplayViewProps): JSX.Element {
  return (
    <div className="ga-guess-replay" data-testid="game-board-guess">
      <div className="ga-guess-replay__header">
        <div className="ga-guess-replay__title">Number Guesser</div>
        <div className="ga-guess-replay__sub">
          {view.finished
            ? `The secret was ${view.secret}`
            : "Players are still committing their guesses"}
        </div>
      </div>
      <ul className="ga-guess-replay__list" role="list">
        {participants.map((p, i) => {
          const guess = view.guesses[i];
          const guessShown =
            view.finished && typeof guess === "number"
              ? guess
              : guess === true
                ? "Guessed"
                : "Pending";
          const distance =
            view.finished && typeof guess === "number" ? Math.abs(guess - view.secret) : null;
          const isClosest =
            view.finished &&
            typeof guess === "number" &&
            view.guesses.every((g) => Math.abs(g - view.secret) >= Math.abs(guess - view.secret));
          return (
            <li
              key={p.id}
              className={`ga-guess-replay__row ${isClosest ? "ga-guess-replay__row--win" : ""}`}
            >
              <div className="ga-guess-replay__name">{p.displayName}</div>
              <div className="ga-guess-replay__guess">{String(guessShown)}</div>
              {distance !== null && (
                <div className="ga-guess-replay__distance">
                  off by <strong>{distance}</strong>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
