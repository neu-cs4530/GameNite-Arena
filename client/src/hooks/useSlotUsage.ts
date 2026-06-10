import { useMemo } from "react";
import { defaultDeploymentFilters, type TrainerGameKey } from "../util/types.ts";
import useDeployments from "./useDeployments.ts";

const CAP_PER_GAME = 3;

/**
 * Returns the current slot usage for a single game (Story 2.7).
 * Reads from `listDeployments` and counts active per game for the viewer.
 */
export default function useSlotUsage(
  gameKey: TrainerGameKey,
  viewerUsername?: string,
): { used: number; cap: number; canDeploy: boolean; loading: boolean } {
  const filters = useMemo(
    () => ({
      ...defaultDeploymentFilters,
      pageSize: 100,
      statuses: ["active" as const],
      games: [gameKey],
      viewerUsername,
    }),
    [gameKey, viewerUsername],
  );
  const { page, loading } = useDeployments(filters);
  const used = page?.deployments.length ?? 0;
  return { used, cap: CAP_PER_GAME, canDeploy: used < CAP_PER_GAME, loading };
}
