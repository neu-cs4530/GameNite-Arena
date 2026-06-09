/**
 * Replay analysis service - mocked. Pulls per-move flags from
 * `mockAnalysis` and synthesizes a plausible result for matches not
 * pre-keyed in the fixture.
 *
 * TODO(@team): real endpoint pending - POST /api/replay/:matchId/analyze.
 */

import type { AnalysisMoveResult, AnalysisResult } from "../util/types.ts";
// import { api } from "./api.ts"; // re-enable when real endpoints land
import { findMockReplay, mockAnalysis } from "../__mocks__/replays.ts";

/** Mock latency so the loading state on "Analyze" is visible. */
const MOCK_LATENCY_MS = 600;

function delay<T>(value: T, ms = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/**
 * Runs analysis on the match's moves. Result is cached in `mockAnalysis`
 * after first run so subsequent calls are cheap.
 */
export async function analyzeReplay(matchId: string): Promise<AnalysisResult> {
  if (mockAnalysis[matchId]) {
    return delay({ ...mockAnalysis[matchId] }, 200);
  }
  const replay = findMockReplay(matchId);
  if (!replay) return Promise.reject(new Error(`Replay not found: ${matchId}`));
  const perMove: AnalysisMoveResult[] = replay.moves.map((m, i) => {
    // Synthesize a plausible flag distribution: ~10% blunder, ~50% best,
    // ~25% neutral, ~15% inaccuracy.
    const r = (i * 31 + 7) % 100;
    let flag: AnalysisMoveResult["flag"];
    if (r < 10) flag = "blunder";
    else if (r < 60) flag = "best";
    else if (r < 75) flag = "inaccuracy";
    else flag = "neutral";
    return {
      moveIndex: m.index,
      flag,
      confidence: 0.55 + (r % 40) / 100,
    };
  });
  const result: AnalysisResult = {
    matchId,
    generatedAt: new Date().toISOString(),
    perMove,
  };
  mockAnalysis[matchId] = result;
  return delay(result);
}
