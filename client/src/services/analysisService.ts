/**
 * Replay analysis service — real-first with mock synthesis as the fallback
 * engine.
 *
 * PROPOSED REST CONTRACT for issue #63 (no server route exists yet — the
 * call below already targets it and falls back on 404/network/5xx, so the
 * day the route lands the client needs ZERO changes):
 *
 *   POST /api/replay/:matchId/analysis
 *          → 200 AnalysisResult   (runs the engine, or returns the cached
 *                                  result if the match was already analyzed;
 *                                  idempotent)
 *   GET  /api/replay/:matchId/analysis
 *          → 200 AnalysisResult | 404 (cached-read variant for consumers
 *                                  that must not trigger a run; the client
 *                                  currently only needs POST)
 *
 * Fallback engine: per-move flags from the `mockAnalysis` fixture, plus a
 * deterministic synthesized result for matches not pre-keyed there. The
 * moves to synthesize from come through `replayService.getReplay` (itself
 * real-first), so the fallback engine works for real server replays too,
 * not just fixture ones. The synthesized result is cached in
 * `mockAnalysis` after the first run so subsequent calls are cheap —
 * mirroring the proposed server caching.
 */

import type { UserAuth } from "@gamenite/shared";
import type { AnalysisMoveResult, AnalysisResult } from "../util/types.ts";
import { api } from "./api.ts";
import { getReplay } from "./replayService.ts";
import { delay, isFallbackEligible } from "./serviceFallback.ts";
import { mockAnalysis } from "../__mocks__/replays.ts";

/** Mock latency so the loading state on "Analyze" is visible. */
const MOCK_LATENCY_MS = 600;

/** Options for {@link analyzeReplay}. */
export interface AnalyzeReplayOptions {
  /**
   * Credentials of the requesting user. The endpoint is authed like the rest
   * of the API and resolves the caller's userId server-side, so without auth
   * we skip the real call and go straight to the fallback engine (matching the
   * annotation service's real-first-when-authed convention).
   */
  auth?: UserAuth;
  /**
   * Which of the user's deployed models should run the engine. Omitted → the
   * server's built-in heuristic analysis. The server validates ownership.
   */
  deploymentId?: string;
}

/**
 * Runs analysis on the match's moves (real-first; see contract above). When a
 * `deploymentId` is supplied the user's deployed model is used as the engine;
 * otherwise the server's built-in heuristic produces the per-move flags.
 */
export async function analyzeReplay(
  matchId: string,
  opts: AnalyzeReplayOptions = {},
): Promise<AnalysisResult> {
  if (opts.auth) {
    try {
      const res = await api.post<AnalysisResult>(`/api/replay/${matchId}/analysis`, {
        auth: opts.auth,
        payload: { deploymentId: opts.deploymentId },
      });
      return res.data;
    } catch (err) {
      if (!isFallbackEligible(err)) throw err;
    }
  }
  return mockAnalyzeReplay(matchId);
}

/** Fallback engine — fixture lookup, then deterministic synthesis. */
async function mockAnalyzeReplay(matchId: string): Promise<AnalysisResult> {
  if (mockAnalysis[matchId]) {
    return delay({ ...mockAnalysis[matchId] }, 200);
  }
  const replay = await getReplay(matchId);
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
  return delay(result, MOCK_LATENCY_MS);
}
