import { useCallback } from "react";
import { getJob } from "../services/trainingService.ts";
import type { TrainingJobDetail } from "../util/types.ts";
import useAsync from "./useAsync.ts";

/** Fetches a single training job by id. */
export default function useJob(jobId: string | undefined) {
  const producer = useCallback(() => {
    if (!jobId) return Promise.reject(new Error("No jobId provided"));
    return getJob(jobId);
  }, [jobId]);
  const result = useAsync<TrainingJobDetail>(producer, [jobId]);
  return {
    job: result.data,
    loading: result.loading,
    error: result.error,
    refetch: result.refetch,
  };
}
