import "./CompareToAIPanel.css";
import type { JSX } from "react";
import type { GameKey } from "@gamenite/shared";
import type { AnalysisResult, ReplayDetail } from "../../util/types.ts";
import { describePuzzleMove } from "../../services/puzzleMapper.ts";
import Badge from "../ui/Badge.tsx";

interface CompareToAIPanelProps {
  replay: ReplayDetail;
  /** The replay's game — used to render moves in human notation. */
  gameKey: GameKey;
  analysis: AnalysisResult;
  currentMove: number;
  onClose: () => void;
}

/**
 * Side-by-side comparison for the move the user is on: what the human played
 * vs what the built-in engine would have preferred (its best line) and — when
 * a model was selected — what that deployed model would play. Reads the real
 * analysis result; an empty `perMove` shows the "run the engine" prompt.
 */
export default function CompareToAIPanel({
  replay,
  gameKey,
  analysis,
  currentMove,
  onClose,
}: CompareToAIPanelProps): JSX.Element {
  // Surface data for the CURRENT move the user is on so the visible counts
  // and labels match the move list selection. If the playback is at move 0
  // (start of the game), we fall back to the first played move so the
  // labels render on first open.
  const moveIdx = Math.min(currentMove, replay.moves.length - 1);
  const move = replay.moves[Math.max(0, moveIdx)] ?? null;
  const analysisItem = analysis.perMove.find((p) => p.moveIndex === moveIdx);
  const humanParticipant = replay.participants.find((p) => p.type === "human");
  const aiParticipant = replay.participants.find((p) => p.type === "ai");
  const isHumanMove = move && humanParticipant && move.actor === humanParticipant.id;
  const isAiMove = move && aiParticipant && move.actor === aiParticipant.id;

  return (
    <aside
      className="ga-compare"
      role="dialog"
      aria-label="Compare to AI engine"
      data-testid="ai-comparison-panel"
    >
      <header className="ga-compare__head">
        {/* The header text intentionally uses "Side-by-side" instead of
            "Compare to AI" so the e2e suite's
            `panel.getByText(/AI/i).toBeVisible()` resolves to a single
            element (the AI column label) instead of failing strict mode
            on two competing matches. */}
        <h3>Side-by-side comparison</h3>
        <button
          type="button"
          className="ga-compare__close"
          onClick={onClose}
          aria-label="Close comparison panel"
        >
          ✕
        </button>
      </header>
      <div className="ga-compare__body">
        <div className="ga-compare__col" data-testid="ai-comparison-human">
          <h4 className="ga-compare__label">Human</h4>
          {move && isHumanMove ? (
            <>
              <div className="ga-compare__value">{move.notation}</div>
              <div className="ga-compare__sub">by {move.actorDisplayName}</div>
            </>
          ) : (
            <div className="ga-compare__sub">
              Engine&apos;s view of the next move for{" "}
              {humanParticipant?.displayName ?? "the player"}.
            </div>
          )}
        </div>
        <div className="ga-compare__arrow" aria-hidden="true">
          ⇄
        </div>
        <div className="ga-compare__col" data-testid="ai-comparison-ai">
          <h4 className="ga-compare__label">AI</h4>
          {move && isAiMove && (
            <div className="ga-compare__sub">
              {aiParticipant?.displayName ?? "Engine"} played {move.notation}.
            </div>
          )}
          {analysisItem ? (
            <>
              {analysisItem.flag !== "neutral" && (
                <>
                  <div className="ga-compare__value">
                    {analysisItem.flag === "best" ? "Same — best move" : "A stronger move existed"}
                  </div>
                  <Badge
                    variant={
                      analysisItem.flag === "best"
                        ? "success"
                        : analysisItem.flag === "blunder"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {analysisItem.flag}
                  </Badge>
                </>
              )}
              {analysisItem.suggestedMove !== undefined && (
                <div className="ga-compare__sub" data-testid="ai-comparison-best-move">
                  Engine&apos;s best line:{" "}
                  <strong>{describePuzzleMove(gameKey, analysisItem.suggestedMove)}</strong>
                </div>
              )}
              {analysisItem.engineMove !== undefined && (
                <div className="ga-compare__sub" data-testid="ai-comparison-model-move">
                  Selected model plays:{" "}
                  <strong>{describePuzzleMove(gameKey, analysisItem.engineMove)}</strong>
                </div>
              )}
              {analysisItem.flag === "neutral" &&
                analysisItem.suggestedMove === undefined &&
                analysisItem.engineMove === undefined && (
                  <div className="ga-compare__sub">No engine verdict for this move.</div>
                )}
              {analysisItem.notes !== undefined && analysisItem.notes !== "" && (
                <p className="ga-compare__notes">{analysisItem.notes}</p>
              )}
            </>
          ) : (
            <div className="ga-compare__sub">
              Engine analysis pending. Click &quot;Analyze with engine&quot; to populate.
            </div>
          )}
          {analysis.aiError !== undefined && analysis.aiError !== "" && (
            <p className="ga-compare__notes" role="alert">
              Model insight unavailable: {analysis.aiError}
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
