/**
 * Trainer deployment service functions.
 *
 * All MOCKED. Pattern mirrors `replayService`.
 */

import type {
  CreateDeploymentPayload,
  DeploymentDetail,
  DeploymentFilters,
  DeploymentListPage,
  DeploymentStatus,
  TrainerGameKey,
} from "../util/types.ts";
// import { api } from "./api.ts";
import {
  assertCapAvailable,
  countActiveDeploymentsForGame,
  DEPLOYMENT_CAP_PER_GAME,
  filterMockDeployments,
  findMockDeployment,
  findMockModel,
  MOCK_DEPLOYMENTS,
  setDeploymentStatus,
  trainerDaysAgo,
} from "../__mocks__/training.ts";

const MOCK_LATENCY_MS = 80;
function delay<T>(value: T, ms = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/** Paginated, filtered deployments. */
export async function listDeployments(filters: DeploymentFilters): Promise<DeploymentListPage> {
  // TODO(@team): real endpoint pending — `GET /api/deployment/list`.
  const { deployments, total } = filterMockDeployments(filters);
  return delay({ deployments, total, page: filters.page, pageSize: filters.pageSize });
}

/** Detail for a single deployment. */
export async function getDeployment(deploymentId: string): Promise<DeploymentDetail> {
  // TODO(@team): real endpoint pending — `GET /api/deployment/:deploymentId`.
  const d = findMockDeployment(deploymentId);
  if (!d) return Promise.reject(new Error(`Deployment not found: ${deploymentId}`));
  return delay({
    ...d,
    recentMatches: d.recentMatches.slice(),
    activitySeries: d.activitySeries.slice(),
  });
}

/** Creates a new deployment. Enforces the 3-per-game cap (Story 2.7). */
export async function createDeployment(
  modelId: string,
  payload: CreateDeploymentPayload,
): Promise<DeploymentDetail> {
  // TODO(@team): real endpoint pending — `POST /api/deployment`.
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
  return delay(detail);
}

/** Pause / resume / retire state machine. */
export async function updateDeploymentStatus(
  deploymentId: string,
  status: DeploymentStatus,
): Promise<DeploymentDetail> {
  // TODO(@team): real endpoint pending — `POST /api/deployment/:deploymentId/status`.
  const d = setDeploymentStatus(deploymentId, status);
  if (!d) return Promise.reject(new Error(`Deployment not found: ${deploymentId}`));
  return delay({
    ...d,
    recentMatches: d.recentMatches.slice(),
    activitySeries: d.activitySeries.slice(),
  });
}

/** Slot usage for the cap indicator (Story 2.7). */
export function getSlotUsage(
  userId: string,
  gameKey: TrainerGameKey,
): { used: number; cap: number; canDeploy: boolean } {
  const used = countActiveDeploymentsForGame(userId, gameKey);
  return { used, cap: DEPLOYMENT_CAP_PER_GAME, canDeploy: used < DEPLOYMENT_CAP_PER_GAME };
}
