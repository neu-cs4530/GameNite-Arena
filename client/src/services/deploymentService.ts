/**
 * Trainer deployment mutations — REAL only (reads live in
 * trainerViewService.listDeploymentViews, which serves the dashboard, the
 * game-section seat picker, and the model card from the same endpoint).
 *
 * Server endpoints (model.controller.ts — deployments live under the
 * /api/model namespace):
 *   POST  /api/model/:id/deploy      — create a deployment slot (auth'd)
 *   PATCH /api/model/deployment/:id  — pause / resume / retire (auth'd)
 *
 * Meaningful rejections (403 not-owner, 422 cap exceeded / no artifact)
 * surface to the caller as real errors, never get swallowed.
 */

import type { UserAuth } from "@gamenite/shared";
import type { CreateDeploymentPayload, DeploymentDetail, DeploymentStatus } from "../util/types.ts";
import { api } from "./api.ts";
import { mapDeploymentInfoToDetail, type DeploymentInfoWire } from "./modelMapper.ts";

/** Pull the server's {error} body out of an axios rejection, if present. */
function extractApiError(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "response" in err) {
    const data = (err as { response?: { data?: { error?: string } } }).response?.data;
    if (data?.error) return data.error;
  }
  return err instanceof Error ? err.message : fallback;
}

/**
 * Creates a new deployment: `POST /api/model/:id/deploy` with
 * `{ auth, payload: { displayName } }` → 201 DeploymentInfo. The 3-per-game
 * cap is enforced server-side; callers pre-check with countActiveForGame
 * for a friendlier message but the server has the last word.
 */
export async function createDeployment(
  modelId: string,
  payload: CreateDeploymentPayload,
  auth: UserAuth,
): Promise<DeploymentDetail> {
  try {
    const res = await api.post<DeploymentInfoWire>(
      `/api/model/${encodeURIComponent(modelId)}/deploy`,
      {
        auth,
        payload: { displayName: payload.displayName || undefined },
      },
    );
    return mapDeploymentInfoToDetail(res.data, {
      owner: { username: auth.username, displayName: auth.username },
    });
  } catch (err) {
    throw new Error(extractApiError(err, "Could not create the deployment"));
  }
}

/**
 * Pause / resume / retire state machine: `PATCH /api/model/deployment/:id`
 * with `{ auth, payload: status }` (the payload is the bare status string
 * per the server's zod schema).
 */
export async function updateDeploymentStatus(
  deploymentId: string,
  status: DeploymentStatus,
  auth: UserAuth,
): Promise<DeploymentDetail> {
  try {
    const res = await api.patch<DeploymentInfoWire>(
      `/api/model/deployment/${encodeURIComponent(deploymentId)}`,
      { auth, payload: status },
    );
    return mapDeploymentInfoToDetail(res.data, {
      owner: { username: auth.username, displayName: auth.username },
    });
  } catch (err) {
    throw new Error(extractApiError(err, "Could not update the deployment"));
  }
}
