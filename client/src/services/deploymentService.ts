/**
 * Trainer deployment service functions.
 *
 * Real-first pattern (mirrors `replayService.ts` / `modelService.ts`).
 *
 * What the server actually serves today (model.controller.ts — deployments
 * live under the /api/model namespace):
 *   POST  /api/model/:id/deploy      — create a deployment slot (auth'd)
 *   PATCH /api/model/deployment/:id  — pause / resume / retire (auth'd)
 *
 * There is NO list or per-id GET endpoint for deployments yet, so reads
 * stay mock-only (marked TODO below). Mutations go real-first whenever the
 * caller supplies `auth` (the server's withAuth contract needs the
 * username/password pair; mirrors `trainingService.submitJob`): real
 * attempt → on network/5xx or per-id 404 (fixture-only ids like
 * `mock-model-1`) → mock fallback. Meaningful rejections (403 not-owner,
 * 422 cap exceeded) are surfaced, never swallowed.
 *
 * Until call sites thread `auth` through, mutations resolve via the mock —
 * the real branch is in place so flipping them over is a one-line change
 * per call site.
 */

import type { UserAuth } from "@gamenite/shared";
import type {
  CreateDeploymentPayload,
  DeploymentDetail,
  DeploymentFilters,
  DeploymentListPage,
  DeploymentStatus,
  TrainerGameKey,
} from "../util/types.ts";
import { api } from "./api.ts";
import { mapDeploymentInfoToDetail, type DeploymentInfoWire } from "./modelMapper.ts";
import { delay, isFallbackEligible } from "./serviceFallback.ts";
import {
  assertCapAvailable,
  countActiveDeploymentsForGame,
  DEPLOYMENT_CAP_PER_GAME,
  filterMockDeployments,
  findMockDeployment,
  findMockModel,
  MOCK_DEPLOYMENTS,
  setDeploymentStatus as setMockDeploymentStatus,
  trainerDaysAgo,
} from "../__mocks__/training.ts";

const MOCK_LATENCY_MS = 80;

/**
 * Paginated, filtered deployments.
 *
 * TODO(@team): real endpoint pending — `GET /api/deployment/list` (or
 * `GET /api/model/deployment/user/:username`). DeploymentRepo data exists
 * server-side but is not exposed for reads yet, so this is mock-only.
 */
export async function listDeployments(filters: DeploymentFilters): Promise<DeploymentListPage> {
  const { deployments, total } = filterMockDeployments(filters);
  return delay(
    { deployments, total, page: filters.page, pageSize: filters.pageSize },
    MOCK_LATENCY_MS,
  );
}

/**
 * Detail for a single deployment.
 *
 * TODO(@team): real endpoint pending — `GET /api/model/deployment/:id`.
 * Same gap as `listDeployments`; mock-only until reads are exposed.
 */
export async function getDeployment(deploymentId: string): Promise<DeploymentDetail> {
  const d = findMockDeployment(deploymentId);
  if (!d) return Promise.reject(new Error(`Deployment not found: ${deploymentId}`));
  return delay(
    {
      ...d,
      recentMatches: d.recentMatches.slice(),
      activitySeries: d.activitySeries.slice(),
    },
    MOCK_LATENCY_MS,
  );
}

/**
 * Creates a new deployment. Enforces the 3-per-game cap (Story 2.7).
 *
 * Real path: `POST /api/model/:id/deploy` with `{ auth, payload:
 * { displayName } }` → 201 DeploymentInfo. Taken whenever `auth` is
 * supplied; a 404 (model id only exists in the fixture) or network/5xx
 * falls back to the mock, while 403/422 (not owner / cap exceeded / no
 * artifact) surface to the caller.
 */
export async function createDeployment(
  modelId: string,
  payload: CreateDeploymentPayload,
  auth?: UserAuth,
): Promise<DeploymentDetail> {
  if (auth) {
    try {
      const res = await api.post<DeploymentInfoWire>(`/api/model/${modelId}/deploy`, {
        auth,
        payload: { displayName: payload.displayName || undefined },
      });
      return mapDeploymentInfoToDetail(res.data, {
        owner: { username: auth.username, displayName: auth.username },
      });
    } catch (err) {
      if (!isFallbackEligible(err)) throw err;
    }
  }
  const model = findMockModel(modelId);
  if (!model) return Promise.reject(new Error(`Model not found: ${modelId}`));
  assertCapAvailable(model.owner.username, model.gameKey);
  const id = `mock-deployment-${MOCK_DEPLOYMENTS.length + 1}`;
  const detail: DeploymentDetail = {
    id,
    modelId,
    modelDisplayName: model.displayName,
    displayName: payload.displayName || `${model.displayName} live`,
    gameKey: model.gameKey,
    status: "active",
    owner: { username: model.owner.username, displayName: model.owner.displayName },
    elo: model.elo,
    matchesPlayed: 0,
    invalidMoveStreak: 0,
    invalidMoveThreshold: 3,
    createdAt: trainerDaysAgo(0),
    recentMatches: [],
    activitySeries: [],
  };
  MOCK_DEPLOYMENTS.push(detail);
  if (!model.deploymentIds.includes(id)) model.deploymentIds.push(id);
  model.hasActiveDeployment = true;
  return delay(detail, MOCK_LATENCY_MS);
}

/**
 * Pause / resume / retire state machine.
 *
 * Real path: `PATCH /api/model/deployment/:id` with `{ auth, payload:
 * status }` (the payload is the bare status string per the server's zod
 * schema). Fallback semantics match `createDeployment`.
 */
export async function updateDeploymentStatus(
  deploymentId: string,
  status: DeploymentStatus,
  auth?: UserAuth,
): Promise<DeploymentDetail> {
  if (auth) {
    try {
      const res = await api.patch<DeploymentInfoWire>(`/api/model/deployment/${deploymentId}`, {
        auth,
        payload: status,
      });
      return mapDeploymentInfoToDetail(res.data, {
        owner: { username: auth.username, displayName: auth.username },
      });
    } catch (err) {
      if (!isFallbackEligible(err)) throw err;
    }
  }
  const d = setMockDeploymentStatus(deploymentId, status);
  if (!d) return Promise.reject(new Error(`Deployment not found: ${deploymentId}`));
  return delay(
    {
      ...d,
      recentMatches: d.recentMatches.slice(),
      activitySeries: d.activitySeries.slice(),
    },
    MOCK_LATENCY_MS,
  );
}

/**
 * Slot usage for the cap indicator (Story 2.7).
 *
 * Derived client-side from the deployment list; inherits `listDeployments`'
 * mock-only status (same TODO applies). `useSlotUsage` computes the same
 * figure through `listDeployments`, so both stay consistent automatically
 * once a real list endpoint lands.
 */
export function getSlotUsage(
  userId: string,
  gameKey: TrainerGameKey,
): { used: number; cap: number; canDeploy: boolean } {
  const used = countActiveDeploymentsForGame(userId, gameKey);
  return { used, cap: DEPLOYMENT_CAP_PER_GAME, canDeploy: used < DEPLOYMENT_CAP_PER_GAME };
}
