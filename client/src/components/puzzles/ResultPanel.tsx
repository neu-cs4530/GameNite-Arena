import "./ResultPanel.css";
import type { JSX } from "react";
import type { GameKey, PuzzleAttemptResult } from "@gamenite/shared";
import Button from "../ui/Button.tsx";
import Disclosure from "../ui/Disclosure.tsx";
import RatingEmblem from "../ui/RatingEmblem.tsx";
import StatTile from "../ui/StatTile.tsx";
import { describePuzzleMove, describeRatingChange } from "../../services/puzzleMapper.ts";

interface ResultPanelProps {
  gameKey: GameKey;
  result: PuzzleAttemptResult;
  solutionOpen: boolean;
  onSolutionToggle: (open: boolean) => void;
  onRetry: () => void;
}

/**
 * Post-attempt verdict: rating + streak tiles, then the solution reveal.
 * Everything here renders from the attempt RESPONSE — the winning move and
 * its explanation only exist client-side once the server has graded an
 * attempt (the GET never carries them).
 */
export default function ResultPanel({
  gameKey,
  result,
  solutionOpen,
  onSolutionToggle,
  onRetry,
}: ResultPanelProps): JSX.Element {
  return (
    <div
      className={`ga-puzzle-result ga-puzzle-result--${result.success ? "success" : "fail"}`}
      data-testid="puzzle-result"
    >
      <div className="ga-puzzle-result__headline-row">
        <h4 className="ga-puzzle-result__headline">
          {result.success ? "Solved — that's the move!" : "Not this time."}
        </h4>
        <RatingEmblem
          rating={result.newRating.rating}
          rd={result.newRating.rd}
          testId="puzzle-rating-emblem"
        />
      </div>

      <div className="ga-puzzle-result__tiles">
        <StatTile
          label="Puzzle Glicko"
          value={Math.round(result.newRating.rating)}
          sub={describeRatingChange(result.rated, result.eloDelta)}
          tone={result.success ? "success" : "danger"}
          testId="puzzle-glicko-tile"
        />
        <StatTile
          label="Streak"
          value={result.streak.current}
          sub={`best ${result.streak.best}`}
          testId="puzzle-streak-tile"
        />
      </div>

      <Disclosure
        summary="Solution & explanation"
        open={solutionOpen}
        onToggle={onSolutionToggle}
        level="inline"
        testId="puzzle-solution"
      >
        <p className="ga-puzzle-result__solution-move">
          Winning move: <strong>{describePuzzleMove(gameKey, result.solutionMove)}</strong>
        </p>
        {result.explanation !== undefined && (
          <p className="ga-puzzle-result__explanation">{result.explanation}</p>
        )}
      </Disclosure>

      <div className="ga-puzzle-result__retry-row">
        <Button variant="secondary" onClick={onRetry} data-testid="puzzle-retry">
          Try again
        </Button>
        <span className="ga-puzzle-result__fine-print">
          Retries are practice — your first unhinted attempt of the day is the rated one.
        </span>
      </div>
    </div>
  );
}
