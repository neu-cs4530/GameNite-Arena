/**
 * Maps the server's model / deployment wire shapes onto the richer client
 * view types. Mirrors `trainingMapper.ts`.
 *
 * The wire shapes here are hand-mirrored from
 * `server/src/services/model.service.ts` (`ModelInfo` / `DeploymentInfo`);
 * once those move into `@gamenite/shared`, swap these local declarations
 * for the shared imports.
 *
 * The mapping must stay TOTAL: every field the trainer pages dereference
 * without guards gets an explicit value, because the server legitimately
 * does not track several of them yet (per-model Elo, win rate, fork
 * lineage, checkpoints, activity series). Those default to the same
 * zero-state a freshly uploaded model would have, and get real values as
 * the corresponding server features land.
 */

import type {
  DeploymentDetail,
  DeploymentStatus,
  ModelDetail,
  ModelSummary,
  ModelVisibility,
  TrainerGameKey,
  TrainerOwnerRef,
} from "../util/types.ts";

/** JSON projection of server `ModelInfo` (Dates serialize to ISO strings). */
export interface ModelInfoWire {
  modelId: string;
  owner: { username: string; display: string; createdAt: string };
  gameKey: TrainerGameKey;
  displayName: string;
  artifactRef?: string;
  visibility: ModelVisibility;
  createdAt: string;
  updatedAt: string;
}

/** JSON projection of server `DeploymentInfo`. */
export interface DeploymentInfoWire {
  deploymentId: string;
  modelId: string;
  userId: string;
  gameKey: TrainerGameKey;
  displayName: string;
  status: DeploymentStatus;
  createdAt: string;
  updatedAt: string;
}

/** Default Elo for entities the rating system hasn't scored yet. */
const UNRATED_ELO = 1000;

export function mapModelInfoToDetail(info: ModelInfoWire): ModelDetail {
  return {
    id: info.modelId,
    displayName: info.displayName,
    gameKey: info.gameKey,
    owner: { username: info.owner.username, displayName: info.owner.display },
    visibility: info.visibility,
    // Not tracked per-model server-side yet — zero-state defaults.
    elo: UNRATED_ELO,
    winRate: 0,
    matchesPlayed: 0,
    forkCount: 0,
    hasActiveDeployment: false,
    hasCheckpoint: false,
    isStarterTemplate: false,
    forkedFrom: undefined,
    createdAt: info.createdAt,
    lastTrainedAt: info.updatedAt,
    jobIds: [],
    deploymentIds: [],
    sourceRef: info.artifactRef ?? "",
  };
}

/** List rows use the summary subset; the detail shape satisfies it. */
export function mapModelInfoToSummary(info: ModelInfoWire): ModelSummary {
  return mapModelInfoToDetail(info);
}

/**
 * Optional caller-supplied context for fields the deployment wire shape
 * doesn't carry (the server returns ids, not display projections).
 */
export interface DeploymentMapContext {
  modelDisplayName?: string;
  owner?: TrainerOwnerRef;
  elo?: number;
}

export function mapDeploymentInfoToDetail(
  info: DeploymentInfoWire,
  ctx: DeploymentMapContext = {},
): DeploymentDetail {
  return {
    id: info.deploymentId,
    modelId: info.modelId,
    modelDisplayName: ctx.modelDisplayName ?? info.displayName,
    displayName: info.displayName,
    gameKey: info.gameKey,
    status: info.status,
    owner: ctx.owner ?? { username: info.userId, displayName: info.userId },
    elo: ctx.elo ?? UNRATED_ELO,
    // Not tracked server-side yet — zero-state defaults.
    matchesPlayed: 0,
    invalidMoveStreak: 0,
    invalidMoveThreshold: 3,
    createdAt: info.createdAt,
    pausedAt: info.status === "paused" ? info.updatedAt : undefined,
    retiredAt: info.status === "retired" ? info.updatedAt : undefined,
    recentMatches: [],
    activitySeries: [],
  };
}
