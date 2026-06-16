import "./EngineInsightPanel.css";
import type { JSX } from "react";
import type { GameKey } from "@gamenite/shared";
import type { AnalysisMoveResult } from "../../util/types.ts";
import { describePuzzleMove } from "../../services/puzzleMapper.ts";

export interface EngineVerdictView {
  flag: AnalysisMoveResult["flag"];
  headline: string;
  played: string;
  /** The engine's preferred move, when it differs from what was played. */
  best?: string;
  notes?: string;
}

/**
 * Pure: turn the engine's per-move analysis into display strings. Exported so
 * the verdict logic is unit-testable without rendering a component.
 */
export function engineVerdict(
  gameKey: GameKey,
  item: AnalysisMoveResult,
  playedMove: unknown,
): EngineVerdictView {
  const headline =
    item.flag === "best"
      ? "Best move"
      : item.flag === "blunder"
        ? "Blunder"
        : item.flag === "inaccuracy"
          ? "Inaccuracy"
          : "No better move"; // neutral: a forced / already-lost position
  return {
    flag: item.flag,
    headline,
    played: describePuzzleMove(gameKey, playedMove),
    best:
      item.suggestedMove !== undefined
        ? describePuzzleMove(gameKey, item.suggestedMove)
        : undefined,
    notes: item.notes !== undefined && item.notes !== "" ? item.notes : undefined,
  };
}

const toneClass: Record<AnalysisMoveResult["flag"], string> = {
  best: "ga-engine-insight--best",
  blunder: "ga-engine-insight--blunder",
  inaccuracy: "ga-engine-insight--inaccuracy",
  neutral: "ga-engine-insight--neutral",
};

interface EngineInsightPanelProps {
  gameKey: GameKey;
  item: AnalysisMoveResult;
  /** The move that produced the position currently on the board. */
  playedMove: unknown;
  /** 1-based number of the move being judged (for the header). */
  moveNumber: number;
}

/**
 * The built-in engine's verdict on the move that produced the current position
 * (closed-form games: nim, tic-tac-toe). Sits at the top of the rail as its
 * own thing — the deployed-model comparison lives separately in the Engine
 * drawer's Compare panel.
 */
export default function EngineInsightPanel({
  gameKey,
  item,
  playedMove,
  moveNumber,
}: EngineInsightPanelProps): JSX.Element {
  const verdict = engineVerdict(gameKey, item, playedMove);
  return (
    <section
      className={`ga-engine-insight ${toneClass[verdict.flag]}`}
      data-testid="engine-insight"
      aria-label="Engine analysis"
    >
      <header className="ga-engine-insight__head">
        <span className="ga-engine-insight__dot" aria-hidden="true" />
        <h3 className="ga-engine-insight__headline" data-testid="engine-insight-headline">
          {verdict.headline}
        </h3>
        <span className="ga-engine-insight__movenum">Move {moveNumber}</span>
      </header>
      <p className="ga-engine-insight__played">
        Played: <strong>{verdict.played}</strong>
      </p>
      {verdict.best !== undefined && (
        <p className="ga-engine-insight__best" data-testid="engine-insight-best">
          Engine&apos;s best: <strong>{verdict.best}</strong>
        </p>
      )}
      {verdict.notes !== undefined && <p className="ga-engine-insight__notes">{verdict.notes}</p>}
    </section>
  );
}
