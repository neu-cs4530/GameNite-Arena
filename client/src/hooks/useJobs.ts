import { useCallback, useMemo } from "react";
import { listJobs } from "../services/trainingService.ts";
import type { JobFilters, JobListPage } from "../util/types.ts";
import useAsync from "./useAsync.ts";

/** Fetches a paginated, filtered list of training jobs. */
export default function useJobs(filters: JobFilters) {
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);
  const producer = useCallback(() => listJobs(filters), [filtersKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const result = useAsync<JobListPage>(producer, [filtersKey]);
  return {
    page: result.data,
    loading: result.loading,
    error: result.error,
    refetch: result.refetch,
  };
}
