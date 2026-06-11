import { useCallback, useMemo } from "react";
import { listModels } from "../services/modelService.ts";
import type { ModelFilters, ModelListPage } from "../util/types.ts";
import useAsync from "./useAsync.ts";

/** Fetches a paginated, filtered list of models. */
export default function useModels(filters: ModelFilters) {
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);
  const producer = useCallback(() => listModels(filters), [filtersKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const result = useAsync<ModelListPage>(producer, [filtersKey]);
  return {
    page: result.data,
    loading: result.loading,
    error: result.error,
    refetch: result.refetch,
  };
}
