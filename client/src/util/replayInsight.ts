import type { AnalysisMoveResult, AnalysisResult, MatchMoveView } from "./types.ts";

/**
 * The deployed model's move from the position currently on the board — a
 * forward suggestion ("what the model would play next from here"). Returns
 * undefined when there's no analysis or no model move for this position.
 */
export function aiSuggestionAt(
  analysis: AnalysisResult | null | undefined,
  currentMove: number,
): unknown {
  return analysis?.perMove.find((p) => p.moveIndex === currentMove)?.engineMove;
}

export interface EngineInsight {
  item: AnalysisMoveResult;
  /** The move that produced the position currently on the board. */
  playedMove: unknown;
}

/**
 * The built-in engine's verdict on the move that PRODUCED the current position
 * — i.e. the move you're viewing, NOT the next one (moveIndex === currentMove
 * - 1). Returns null when:
 *   - the game has no closed-form engine (`engineEligible` false),
 *   - you're at the start (no move has been played yet), or
 *   - analysis hasn't produced a verdict / move for that index.
 */
export function engineInsightAt(
  analysis: AnalysisResult | null | undefined,
  engineEligible: boolean,
  currentMove: number,
  moves: MatchMoveView[],
): EngineInsight | null {
  if (!engineEligible) return null;
  const index = currentMove - 1;
  if (index < 0) return null;
  const item = analysis?.perMove.find((p) => p.moveIndex === index);
  const playedMove = moves[index]?.move;
  if (item === undefined || playedMove === undefined) return null;
  return { item, playedMove };
}
