import "./TrainingPackFeed.css";
import { useState, type JSX } from "react";
import type { TrainingAttemptResult } from "@gamenite/shared";
import Badge from "../ui/Badge.tsx";
import Button from "../ui/Button.tsx";
import Card from "../ui/Card.tsx";
import PuzzleBoard from "./PuzzleBoard.tsx";
import PuzzleMoveInput from "./PuzzleMoveInput.tsx";
import useAuth from "../../hooks/useAuth.ts";
import { describePuzzleMove, type TrainingPracticeItem } from "../../services/puzzleMapper.ts";
import { submitTrainingAttempt } from "../../services/puzzleService.ts";

type Phase = "viewing" | "submitting" | "result" | "error";

/** One training feed entry: board, move input, then a pass/fail reveal. */
export default function TrainingPuzzleCard({ item }: { item: TrainingPracticeItem }): JSX.Element {
  const auth = useAuth();
  const [phase, setPhase] = useState<Phase>("viewing");
  const [result, setResult] = useState<TrainingAttemptResult | null>(null);

  async function handleSubmit(move: unknown) {
    if (phase !== "viewing") return;
    setPhase("submitting");
    try {
      const res = await submitTrainingAttempt(item.gameKey, auth, {
        sourceMatchId: item.sourceMatchId,
        move,
      });
      setResult(res);
      setPhase("result");
    } catch {
      setPhase("error");
    }
  }

  return (
    <Card testId="training-card" className="ga-training-card">
      <PuzzleBoard
        position={item.position}
        onSubmit={
          phase === "viewing" || phase === "submitting"
            ? (move) => void handleSubmit(move)
            : undefined
        }
        disabled={phase === "submitting"}
      />

      {(phase === "viewing" || phase === "submitting") && (
        <PuzzleMoveInput
          position={item.position}
          disabled={phase === "submitting"}
          onSubmit={(move) => void handleSubmit(move)}
        />
      )}

      {phase === "error" && (
        <div className="ga-training-card__error" role="alert">
          <p className="ga-training-card__fine-print">
            Couldn&apos;t submit your attempt. Check your connection and try again.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPhase("viewing")}
            data-testid="training-retry"
          >
            Try again
          </Button>
        </div>
      )}

      {phase === "result" && result !== null && (
        <div className="ga-training-card__result" data-testid="training-result">
          <Badge variant={result.success ? "success" : "danger"}>
            {result.success ? "Solved" : "Not quite"}
          </Badge>
          <p className="ga-training-card__solution-move">
            Winning move: <strong>{describePuzzleMove(item.gameKey, result.solutionMove)}</strong>
          </p>
          {result.explanation !== undefined && (
            <p className="ga-training-card__fine-print">{result.explanation}</p>
          )}
        </div>
      )}
    </Card>
  );
}
