import { useCallback, useMemo } from "react";
import { listDeployments } from "../services/deploymentService.ts";
import type { DeploymentFilters, DeploymentListPage } from "../util/types.ts";
import useAsync from "./useAsync.ts";

/** Fetches a paginated, filtered list of deployments. */
export default function useDeployments(filters: DeploymentFilters) {
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);
  const producer = useCallback(() => listDeployments(filters), [filtersKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const result = useAsync<DeploymentListPage>(producer, [filtersKey]);
  return {
    page: result.data,
    loading: result.loading,
    error: result.error,
    refetch: result.refetch,
  };
}
