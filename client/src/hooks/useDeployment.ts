import { useCallback } from "react";
import { getDeployment } from "../services/deploymentService.ts";
import type { DeploymentDetail } from "../util/types.ts";
import useAsync from "./useAsync.ts";

/** Fetches a single deployment by id. */
export default function useDeployment(deploymentId: string | undefined) {
  const producer = useCallback(() => {
    if (!deploymentId) return Promise.reject(new Error("No deploymentId provided"));
    return getDeployment(deploymentId);
  }, [deploymentId]);
  const result = useAsync<DeploymentDetail>(producer, [deploymentId]);
  return {
    deployment: result.data,
    loading: result.loading,
    error: result.error,
    refetch: result.refetch,
  };
}
