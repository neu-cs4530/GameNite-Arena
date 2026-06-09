import "./CompareToAIPanel.css";
import type { JSX } from "react";
import type { AnalysisResult, ReplayDetail } from "../../util/types.ts";
import Badge from "../ui/Badge.tsx";

interface CompareToAIPanelProps {
  replay: ReplayDetail;
  analysis: AnalysisResult;
  currentMove: number;
  onClose: () => void;
}

/**
 * Side-by-side comparison: what the human played vs what the engine would
 * have preferred. Reads from the mock analysis result.
 */
export default function CompareToAIPanel({
  replay,
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
              Engine's view of the next move for {humanParticipant?.displayName ?? "the player"}.
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
              <div className="ga-compare__value">
                {analysisItem.flag === "best" ? "Same — best move" : "An alternative"}
              </div>
              <div className="ga-compare__sub">
                Confidence: {Math.round(analysisItem.confidence * 100)}%
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
              {analysisItem.notes && <p className="ga-compare__notes">{analysisItem.notes}</p>}
            </>
          ) : (
            <div className="ga-compare__sub">
              Engine analysis pending. Click "Analyze with engine" to populate.
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
