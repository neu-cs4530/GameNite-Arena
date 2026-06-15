import "./DailyPuzzleCard.css";
import dayjs from "dayjs";
import { useEffect, useReducer, useState, type JSX } from "react";
import { HINT_PENALTY, type GameKey } from "@gamenite/shared";
import Badge from "../ui/Badge.tsx";
import Button from "../ui/Button.tsx";
import Card from "../ui/Card.tsx";
import PuzzleBoard from "./PuzzleBoard.tsx";
import PuzzleMoveInput from "./PuzzleMoveInput.tsx";
import ResultPanel from "./ResultPanel.tsx";
import useAuth from "../../hooks/useAuth.ts";
import {
  applyPuzzleMove,
  describePuzzleMove,
  formatEloDelta,
  type DailyPuzzle,
} from "../../services/puzzleMapper.ts";
import { requestPuzzleHint, submitPuzzleAttempt } from "../../services/puzzleService.ts";
import { attemptReducer, attemptTimeMs, initialAttemptState } from "../../util/puzzleAttempt.ts";
import { gameNames } from "../../util/consts.ts";

interface DailyPuzzleCardProps {
  /** Today's puzzle, already fetched (with `?for=` when signed in) by the
   * page — the card owns the attempt, not the GET. */
  puzzle: DailyPuzzle;
  /** Fired on a successful attempt so the page can mark the tile solved. */
  onSolved: (gameKey: GameKey) => void;
}

/**
 * One game's daily puzzle: board → attempt controls → result, driven by the
 * pure attempt machine in util/puzzleAttempt.ts.
 *
 * The GET carries no solution (that leak is closed server-side). The hint is
 * a server round-trip that forfeits the rated slot — the button says so, and
 * once a hint (or `viewerAttempt.rated`) marks the attempt as practice the
 * card shows it up front instead of surprising the user in the verdict.
 *
 * There is no visible timer — `timeMs` is measured from puzzle load to
 * submit inside the machine, and the submit echoes the GET's `date` so the
 * server grades against the puzzle this card actually rendered.
 */
export default function DailyPuzzleCard({ puzzle, onSolved }: DailyPuzzleCardProps): JSX.Element {
  const auth = useAuth();
  const { gameKey } = puzzle;

  const [attempt, dispatch] = useReducer(attemptReducer, initialAttemptState);
  const [solutionOpen, setSolutionOpen] = useState(false);

  // the attempt clock starts when the puzzle (re)arrives
  useEffect(() => {
    dispatch({ type: "puzzleLoaded", now: Date.now() });
  }, [puzzle]);

  const solvedToday = puzzle.viewerAttempt?.solved === true;
  const hinted = attempt.phase !== "idle" && attempt.hinted;
  // practice means: this attempt cannot move the rating — either a hint was
  // granted (forfeit) or today's rated slot is already spent.
  const practiceOnly = hinted || puzzle.viewerAttempt?.rated === true;

  /** POST the attempt; the machine owns timing, the payload pins the date. */
  async function handleSubmit(move: unknown) {
    if (attempt.phase !== "viewing") return;
    const now = Date.now();
    const payload = {
      move,
      timeMs: attemptTimeMs(attempt.startedAt, now),
      date: puzzle.date,
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
        message: "Couldn't submit your attempt. Check your connection and try again.",
      });
    }
  }

  /** Ask the server for the hint — this forfeits the rated slot for today. */
  async function handleHint() {
    if (attempt.phase !== "viewing" || attempt.hinted || attempt.hintPending) return;
    dispatch({ type: "hintRequested" });
    try {
      const hint = await requestPuzzleHint(gameKey, auth, puzzle.date);
      dispatch({
        type: "hintReceived",
        hint: {
          move: hint.hintMove,
          explanation: hint.explanation,
          eloDelta: hint.eloDelta,
          newRating: hint.newRating,
        },
      });
    } catch {
      dispatch({
        type: "hintFailed",
        message: "Couldn't fetch the hint. Your attempt is still rated. Try again.",
      });
    }
  }

  return (
    <Card testId="puzzle-card" className="ga-puzzle-card">
      <header className="ga-puzzle-card__header">
        <h3 className="ga-puzzle-card__title">{gameNames[gameKey]} — daily puzzle</h3>
        <span className="ga-puzzle-card__header-meta">
          {solvedToday && (
            <Badge variant="success" testId="puzzle-card-solved">
              Solved today ✓
            </Badge>
          )}
          <span className="ga-puzzle-card__date">{dayjs(puzzle.date).format("MMMM D, YYYY")}</span>
        </span>
      </header>

      <PuzzleBoard
        // once submitted, show the move played rather than the pre-move snapshot
        position={
          attempt.phase === "submitting" || attempt.phase === "result"
            ? applyPuzzleMove(puzzle.position, attempt.move)
            : puzzle.position
        }
        onSubmit={
          attempt.phase === "viewing" || attempt.phase === "submitting"
            ? (move) => void handleSubmit(move)
            : undefined
        }
        disabled={attempt.phase === "submitting"}
      />

      {(attempt.phase === "viewing" || attempt.phase === "submitting") && (
        <div className="ga-puzzle-card__attempt">
          {practiceOnly && (
            <p className="ga-puzzle-card__fine-print" data-testid="puzzle-practice-note">
              {hinted
                ? "Hint used: this attempt is practice, but the hint already cost you rating."
                : "Today's rated attempt is done: further attempts are practice."}
            </p>
          )}

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

          {attempt.phase === "viewing" && attempt.hint !== null ? (
            <div className="ga-puzzle-card__hint-reveal" data-testid="puzzle-hint-reveal">
              <p className="ga-puzzle-card__hint-move">
                Winning move: <strong>{describePuzzleMove(gameKey, attempt.hint.move)}</strong>
              </p>
              {attempt.hint.explanation !== undefined && (
                <p className="ga-puzzle-card__fine-print">{attempt.hint.explanation}</p>
              )}
              <p className="ga-puzzle-card__fine-print" data-testid="puzzle-hint-penalty">
                Hint penalty: {formatEloDelta(attempt.hint.eloDelta)} (rating now{" "}
                {Math.round(attempt.hint.newRating.rating)})
              </p>
            </div>
          ) : (
            attempt.phase === "viewing" &&
            !attempt.hinted && (
              <div className="ga-puzzle-card__hint-row">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleHint()}
                  loading={attempt.hintPending}
                  data-testid="puzzle-hint"
                >
                  Need a hint?
                </Button>
                <span className="ga-puzzle-card__fine-print">
                  The hint is the answer. It costs {HINT_PENALTY} rating and makes today&apos;s
                  attempt practice.
                </span>
              </div>
            )
          )}
        </div>
      )}

      {attempt.phase === "result" && (
        <ResultPanel
          gameKey={gameKey}
          result={attempt.result}
          solutionOpen={solutionOpen}
          onSolutionToggle={setSolutionOpen}
          onRetry={() => {
            setSolutionOpen(false);
            dispatch({ type: "retried", now: Date.now() });
          }}
        />
      )}
    </Card>
  );
}
