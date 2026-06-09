import { useCallback, useMemo } from "react";
import { listFeaturedReplays } from "../services/replayService.ts";
import { featuredReplays as seedFeatured, type FeaturedStrip } from "../__mocks__/replays.ts";
import useAsync from "./useAsync.ts";
import type { ReplaySummary } from "../util/types.ts";

export default function useFeaturedReplays(strip: FeaturedStrip) {
  const producer = useCallback(() => listFeaturedReplays(strip), [strip]);
  const seed = useMemo(() => seedFeatured(strip), [strip]);
  const result = useAsync<ReplaySummary[]>(producer, [strip], seed);
  return {
    replays: result.data,
    loading: result.loading,
    error: result.error,
    refetch: result.refetch,
  };
}
