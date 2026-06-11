import { useCallback, useState } from "react";
import { analyzeReplay } from "../services/analysisService.ts";
import type { AnalysisResult } from "../util/types.ts";

/**
 * Lazy analysis hook — does not fire on mount. Component calls `run()` when
 * the user clicks "Analyze with engine".
 */
export default function useAnalysis(matchId: string | undefined) {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const run = useCallback(async () => {
    if (!matchId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await analyzeReplay(matchId);
      setAnalysis(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  return { analysis, loading, error, run };
}
