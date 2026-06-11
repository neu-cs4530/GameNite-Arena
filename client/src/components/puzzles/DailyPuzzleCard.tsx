import "./DailyPuzzleCard.css";
import { useCallback, useEffect, useReducer, useState, type JSX } from "react";
import type { GameKey } from "@gamenite/shared";
import Button from "../ui/Button.tsx";
import Card from "../ui/Card.tsx";
import Disclosure from "../ui/Disclosure.tsx";
import EmptyState from "../ui/EmptyState.tsx";
import ErrorState from "../ui/ErrorState.tsx";
import RatingEmblem from "../ui/RatingEmblem.tsx";
import Skeleton, { SkeletonText } from "../ui/Skeleton.tsx";
import StatTile from "../ui/StatTile.tsx";
import PuzzleBoard from "./PuzzleBoard.tsx";
import PuzzleMoveInput from "./PuzzleMoveInput.tsx";
import useAsync from "../../hooks/useAsync.ts";
import useAuth from "../../hooks/useAuth.ts";
import {
  describePuzzleMove,
  formatEloDelta,
  type DailyPuzzle,
} from "../../services/puzzleMapper.ts";
import { fetchDailyPuzzle, submitPuzzleAttempt } from "../../services/puzzleService.ts";
import {
  attemptReducer,
  attemptTimeMs,
  initialAttemptState,
  type AttemptResultView,
} from "../../util/puzzleAttempt.ts";
import { gameNames } from "../../util/consts.ts";

interface DailyPuzzleCardProps {
  gameKey: GameKey;
  /** Fired on a successful attempt so the page can mark the tile solved. */
  onSolved: (gameKey: GameKey) => void;
}

/**
 * One game's daily puzzle: board → attempt controls → result, driven by the
 * pure attempt machine in util/puzzleAttempt.ts.
 *
 * ⚠️ Solution discipline: the GET response carries the full solution, but
 * nothing below renders `solutionMoves`/`explanation` until the attempt
 * machine reaches the `result` phase. The single sanctioned pre-attempt
 * peek is the hint disclosure, which shows ONLY the first solution move and
 * marks the attempt as hinted.
 *
 * There is no visible timer — `timeMs` is measured from puzzle load to
 * submit inside the machine and sent with the attempt.
 */
export default function DailyPuzzleCard({ gameKey, onSolved }: DailyPuzzleCardProps): JSX.Element {
  const auth = useAuth();
  const producer = useCallback(() => fetchDailyPuzzle(gameKey), [gameKey]);
  const { data: puzzle, loading, error, refetch } = useAsync(producer, [gameKey]);

  const [attempt, dispatch] = useReducer(attemptReducer, initialAttemptState);
  const [hintOpen, setHintOpen] = useState(false);
  const [solutionOpen, setSolutionOpen] = useState(false);

  // the attempt clock starts when the puzzle (re)arrives
  useEffect(() => {
    if (puzzle) dispatch({ type: "puzzleLoaded", now: Date.now() });
  }, [puzzle]);

  /** POST the attempt; the machine owns timing and the hint count. */
  async function handleSubmit(move: unknown) {
    if (attempt.phase !== "viewing" || puzzle === null) return;
    const now = Date.now();
    const payload = {
      move,
      timeMs: attemptTimeMs(attempt.startedAt, now),
      hintsUsed: attempt.hintsUsed,
    };
    dispatch({ type: "submitted", move, now });
    try {
      const result = await submitPuzzleAttempt(gameKey, auth, payload);
      dispatch({ type: "resolved", result });
      setSolutionOpen(false);
      if (result.success) onSolved(gameKey);
    } catch {
      dispatch({
        type: "failed",
        message: "Couldn't submit your attempt — check your connection and try again.",
      });
    }
  }

  if (loading && puzzle === null) {
    return (
      <Card testId="puzzle-card-loading">
        <Skeleton height={160} className="ga-puzzle-card__board-skeleton" />
        <SkeletonText lines={2} />
      </Card>
    );
  }

  if (error) {
    return (
      <Card testId="puzzle-card">
        <ErrorState testId="puzzle-error" title="Couldn't load today's puzzle" retry={refetch} />
      </Card>
    );
  }

  if (puzzle === null) {
    return (
      <Card testId="puzzle-card">
        <EmptyState
          testId="puzzle-empty"
          icon="◌"
          title={`No ${gameNames[gameKey]} puzzle yet today`}
          body="Daily puzzles are mined from real finished matches. Play a match (or check back later) and one will appear."
        />
      </Card>
    );
  }

  return (
    <Card testId="puzzle-card" className="ga-puzzle-card">
      <header className="ga-puzzle-card__header">
        <h3 className="ga-puzzle-card__title">{gameNames[gameKey]} — daily puzzle</h3>
        <span className="ga-puzzle-card__date">{puzzle.date}</span>
      </header>

      <PuzzleBoard position={puzzle.position} />

      {(attempt.phase === "viewing" || attempt.phase === "submitting") && (
        <div className="ga-puzzle-card__attempt">
          <PuzzleMoveInput
            position={puzzle.position}
            disabled={attempt.phase === "submitting"}
            onSubmit={(move) => void handleSubmit(move)}
          />
          {attempt.phase === "viewing" && attempt.error !== null && (
            <p className="ga-puzzle-card__submit-error" role="alert">
              {attempt.error}
            </p>
          )}
          <Disclosure
            summary="Need a hint?"
            open={hintOpen}
            onToggle={(open) => {
              setHintOpen(open);
              // opening the hint marks the attempt as hinted (idempotent)
              if (open) dispatch({ type: "hintRevealed" });
            }}
            level="inline"
            testId="puzzle-hint"
          >
            {/* Only the FIRST solution move — never the full line pre-attempt. */}
            <p className="ga-puzzle-card__hint-move">
              First move of the winning line:{" "}
              <strong>{describePuzzleMove(gameKey, puzzle.solutionMoves[0])}</strong>
            </p>
            <p className="ga-puzzle-card__fine-print">
              Hints count toward this attempt and can cost rating.
            </p>
          </Disclosure>
        </div>
      )}

      {attempt.phase === "result" && (
        <ResultPanel
          gameKey={gameKey}
          puzzle={puzzle}
          result={attempt.result}
          solutionOpen={solutionOpen}
          onSolutionToggle={setSolutionOpen}
          onRetry={() => {
            setHintOpen(false);
            setSolutionOpen(false);
            dispatch({ type: "retried", now: Date.now() });
          }}
        />
      )}
    </Card>
  );
}

interface ResultPanelProps {
  gameKey: GameKey;
  puzzle: DailyPuzzle;
  result: AttemptResultView;
  solutionOpen: boolean;
  onSolutionToggle: (open: boolean) => void;
  onRetry: () => void;
}

/** Post-attempt verdict: rating + streak tiles, then the revealed solution. */
function ResultPanel({
  gameKey,
  puzzle,
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
          sub={`${formatEloDelta(result.eloDelta)} this attempt`}
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

      {/* The solution only exists in the DOM from the result phase on. */}
      <Disclosure
        summary="Solution & explanation"
        open={solutionOpen}
        onToggle={onSolutionToggle}
        level="inline"
        testId="puzzle-solution"
      >
        <ol className="ga-puzzle-result__line">
          {puzzle.solutionMoves.map((move, index) => (
            <li key={index}>{describePuzzleMove(gameKey, move)}</li>
          ))}
        </ol>
        {puzzle.explanation && (
          <p className="ga-puzzle-result__explanation">{puzzle.explanation}</p>
        )}
      </Disclosure>

      <div className="ga-puzzle-result__retry-row">
        <Button variant="secondary" onClick={onRetry} data-testid="puzzle-retry">
          Try again
        </Button>
        <span className="ga-puzzle-card__fine-print">
          Every attempt moves your Puzzle Glicko — retries included.
        </span>
      </div>
    </div>
  );
}
