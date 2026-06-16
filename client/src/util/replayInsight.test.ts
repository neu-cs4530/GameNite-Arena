import { describe, expect, it } from "vitest";
import { aiSuggestionAt, engineInsightAt } from "./replayInsight.ts";
import type { AnalysisMoveResult, AnalysisResult, MatchMoveView } from "./types.ts";

function analysis(perMove: AnalysisMoveResult[], aiError?: string): AnalysisResult {
  return { matchId: "m", generatedAt: "t", perMove, aiError };
}
function moveView(index: number, move: unknown): MatchMoveView {
  return { index, actor: "u", actorDisplayName: "U", move, notation: "n", timestamp: "t" };
}

describe("aiSuggestionAt", () => {
  it("returns the engineMove for the current move index", () => {
    const a = analysis([{ moveIndex: 0, flag: "neutral", confidence: 0, engineMove: 3 }]);
    expect(aiSuggestionAt(a, 0)).toBe(3);
  });

  it("returns undefined when the entry has no engineMove or the index is absent", () => {
    const a = analysis([{ moveIndex: 0, flag: "neutral", confidence: 0 }]);
    expect(aiSuggestionAt(a, 0)).toBeUndefined();
    expect(aiSuggestionAt(a, 5)).toBeUndefined();
  });

  it("returns undefined when there is no analysis", () => {
    expect(aiSuggestionAt(null, 0)).toBeUndefined();
    expect(aiSuggestionAt(undefined, 0)).toBeUndefined();
  });
});

describe("engineInsightAt", () => {
  const a = analysis([
    { moveIndex: 0, flag: "best", confidence: 1 },
    { moveIndex: 1, flag: "blunder", confidence: 1, suggestedMove: 1 },
  ]);
  const moves = [moveView(0, 2), moveView(1, 3)];

  it("returns the verdict for the move that PRODUCED the position (currentMove - 1)", () => {
    const r = engineInsightAt(a, true, 1, moves);
    expect(r).not.toBeNull();
    expect(r!.item.moveIndex).toBe(0);
    expect(r!.item.flag).toBe("best");
    expect(r!.playedMove).toBe(2);
  });

  it("returns null at the start of the game (no move played yet)", () => {
    expect(engineInsightAt(a, true, 0, moves)).toBeNull();
  });

  it("returns null for games without a closed-form engine", () => {
    expect(engineInsightAt(a, false, 1, moves)).toBeNull();
  });

  it("returns null when analysis has no verdict for that move", () => {
    expect(engineInsightAt(analysis([]), true, 1, moves)).toBeNull();
    expect(engineInsightAt(null, true, 1, moves)).toBeNull();
  });

  it("returns null when the move record is missing", () => {
    expect(engineInsightAt(a, true, 1, [])).toBeNull();
  });
});
