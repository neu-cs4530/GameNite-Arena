import { useCallback } from "react";
import { getReplay } from "../services/replayService.ts";
import type { ReplayDetail } from "../util/types.ts";
import useAsync from "./useAsync.ts";

/** Fetches a single replay by id. */
export default function useReplay(matchId: string | undefined) {
  const producer = useCallback(() => {
    if (!matchId) return Promise.reject(new Error("No matchId provided"));
    return getReplay(matchId);
  }, [matchId]);
  const result = useAsync<ReplayDetail>(producer, [matchId]);
  return {
    replay: result.data,
    loading: result.loading,
    error: result.error,
    refetch: result.refetch,
  };
}
