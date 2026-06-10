import { useCallback, useMemo } from "react";
import { listReplays } from "../services/replayService.ts";
import { filterMockReplays } from "../__mocks__/replays.ts";
import type { ReplayFilters, ReplayListPage } from "../util/types.ts";
import useAsync from "./useAsync.ts";

/**
 * Fetches a paginated, filtered list of replays. Seeds the data
 * synchronously from the fixture so the first paint already has cards
 * for the e2e suite's immediate `count()` assertions.
 */
export default function useReplays(filters: ReplayFilters) {
  // Memoize the filter object's identity so the producer doesn't change
  // each render. We're already given a value with stable keys, so a JSON
  // dependency is fine here.
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);

  const producer = useCallback(() => listReplays(filters), [filtersKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const seed = useMemo<ReplayListPage>(() => {
    const { replays, total } = filterMockReplays(filters);
    return { replays, total, page: filters.page, pageSize: filters.pageSize };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  const result = useAsync<ReplayListPage>(producer, [filtersKey], seed);
  return {
    page: result.data,
    loading: result.loading,
    error: result.error,
    refetch: result.refetch,
  };
}
