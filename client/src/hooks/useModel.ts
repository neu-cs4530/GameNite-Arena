import { useCallback } from "react";
import { getModel } from "../services/modelService.ts";
import type { ModelDetail } from "../util/types.ts";
import useAsync from "./useAsync.ts";

/** Fetches a single model's full detail. */
export default function useModel(modelId: string | undefined) {
  const producer = useCallback(() => {
    if (!modelId) return Promise.reject(new Error("No modelId provided"));
    return getModel(modelId);
  }, [modelId]);
  const result = useAsync<ModelDetail>(producer, [modelId]);
  return {
    model: result.data,
    loading: result.loading,
    error: result.error,
    refetch: result.refetch,
  };
}
