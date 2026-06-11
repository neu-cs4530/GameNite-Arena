import { useCallback } from "react";
import { getModelCard } from "../services/modelService.ts";
import type { ModelCardStats } from "../util/types.ts";
import useAsync from "./useAsync.ts";

/** Fetches the public model-card stats (Story 2.11). */
export default function useModelCard(modelId: string | undefined) {
  const producer = useCallback(() => {
    if (!modelId) return Promise.reject(new Error("No modelId provided"));
    return getModelCard(modelId);
  }, [modelId]);
  const result = useAsync<ModelCardStats>(producer, [modelId]);
  return {
    stats: result.data,
    loading: result.loading,
    error: result.error,
    refetch: result.refetch,
  };
}
