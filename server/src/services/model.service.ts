/**
 *
 * Business logic for AI model upload, validation, and deployment management.
 *
 * Sprint 2: uses Zach's artifactStore.service.ts for .pth storage (local
 * filesystem, shared with inference service on combined Render service).
 * No object storage needed.
 */

import type { GameKey } from "@gamenite/shared";
import type { DeploymentRecord, RecordId } from "../models.ts";
import { ModelRepo, DeploymentRepo, TrainingJobRepo } from "../repository.ts";
import { populateSafeUserInfo } from "./user.service.ts";
import type { UserWithId } from "../types.ts";
import { storeModelArtifact } from "./artifactStore.service.ts";
import * as inferenceClient from "./inferenceClient.ts";

// Constants

const SUPPORTED_GAME_KEYS: GameKey[] = [
  "tictactoe",
  "connect4",
  "checkers",
  "nim",
  "guess",
] as GameKey[];

const CURRENT_ADAPTER_VERSION = "1.0.0";
const MAX_ACTIVE_DEPLOYMENTS_PER_GAME = 3; // CoS 2.7

// Response types

export interface ModelInfo {
  modelId: RecordId;
  owner: { username: string; display: string; createdAt: Date };
  gameKey: GameKey;
  displayName: string;
  artifactRef: string | undefined;
  visibility: "private" | "public";
  createdAt: Date;
  updatedAt: Date;
}

export interface DeploymentInfo {
  deploymentId: RecordId;
  modelId: RecordId;
  userId: RecordId;
  gameKey: GameKey;
  displayName: string;
  status: "active" | "paused" | "retired";
  createdAt: Date;
  updatedAt: Date;
}

// Helpers

async function populateModelInfo(modelId: RecordId): Promise<ModelInfo> {
  const record = await ModelRepo.get(modelId);
  const owner = await populateSafeUserInfo(record.userId);
  return {
    modelId,
    owner,
    gameKey: record.gameKey,
    displayName: record.displayName,
    artifactRef: record.artifactRef,
    visibility: record.visibility,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

async function populateDeploymentInfo(deploymentId: RecordId): Promise<DeploymentInfo> {
  const record = await DeploymentRepo.get(deploymentId);
  return {
    deploymentId,
    modelId: record.modelId,
    userId: record.userId,
    gameKey: record.gameKey,
    displayName: record.displayName,
    status: record.status,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

// Service functions

/**
 * Validate and store an uploaded .pth artifact.
 * Uses artifactStore.storeModelArtifact() to move the file into the
 * canonical models/ directory as <modelId>.pth.
 */
export async function uploadModel(
  user: UserWithId,
  filePath: string,
  displayName: string,
  metadata: {
    game: string;
    adapterVersion: string;
    trainedAt: number;
  },
): Promise<ModelInfo> {
  if (!SUPPORTED_GAME_KEYS.includes(metadata.game as GameKey)) {
    throw new Error(
      `Unsupported game '${metadata.game}'. Supported: ${SUPPORTED_GAME_KEYS.join(", ")}`,
    );
  }
  if (metadata.adapterVersion !== CURRENT_ADAPTER_VERSION) {
    throw new Error(
      `Adapter version mismatch: model=${metadata.adapterVersion}, ` +
        `current=${CURRENT_ADAPTER_VERSION}. Please retrain with the latest adapter.`,
    );
  }

  const now = new Date().toISOString();
  // Create the model record first to get the modelId for the artifact name.
  const modelId = await ModelRepo.add({
    userId: user.userId,
    gameKey: metadata.game as GameKey,
    displayName: displayName.trim() || `${metadata.game}-model`,
    sourceRef: "",
    artifactRef: undefined,
    visibility: "private",
    createdAt: now,
    updatedAt: now,
  });

  // Store artifact as models/<modelId>.pth
  const { ref } = await storeModelArtifact(modelId, filePath);

  // Update record with artifact ref
  const record = await ModelRepo.get(modelId);
  record.artifactRef = ref;
  record.updatedAt = new Date().toISOString();
  await ModelRepo.set(modelId, record);

  return populateModelInfo(modelId);
}

export async function getModelById(modelId: RecordId): Promise<ModelInfo | null> {
  const record = await ModelRepo.find(modelId);
  if (!record) return null;
  return populateModelInfo(modelId);
}

/**
 * Forks a model into a NEW record owned by the caller (Story 2.13): the
 * gameKey carries over, the fork starts private with no trained artifact,
 * and sourceRef/forkedFrom point back at the source. Visibility matches
 * getModelById: any model that endpoint returns can be forked.
 *
 * @param user - The caller; becomes the fork's owner.
 * @param sourceModelId - The model being forked.
 * @param displayName - Optional name; defaults to `Fork of <source name>`.
 * @returns the new model, in the same shape as the other model endpoints.
 * @throws if the source model does not exist.
 */
export async function forkModel(
  user: UserWithId,
  sourceModelId: RecordId,
  displayName?: string,
): Promise<ModelInfo> {
  const source = await ModelRepo.find(sourceModelId);
  if (!source) throw new Error(`Model ${sourceModelId} not found`);

  const now = new Date().toISOString();
  const modelId = await ModelRepo.add({
    userId: user.userId,
    gameKey: source.gameKey,
    displayName: displayName ?? `Fork of ${source.displayName}`,
    sourceRef: `fork:${sourceModelId}`,
    artifactRef: undefined,
    forkedFrom: sourceModelId,
    visibility: "private",
    createdAt: now,
    updatedAt: now,
  });

  return populateModelInfo(modelId);
}

/**
 * Model ids that belong to a training run which ended canceled or failed.
 * A run creates its model record up front (trainingSession.service), so a
 * canceled/failed run leaves a speculative orphan with no artifact — these
 * shouldn't appear in the user's model lists.
 */
async function abandonedRunModelIds(userId: RecordId): Promise<Set<string>> {
  const jobKeys = await TrainingJobRepo.getAllKeys();
  if (jobKeys.length === 0) return new Set();
  const jobs = await TrainingJobRepo.getMany(jobKeys);
  const dead = new Set<string>();
  for (const job of jobs) {
    if (job.userId === userId && (job.status === "canceled" || job.status === "failed")) {
      dead.add(job.modelId);
    }
  }
  return dead;
}

export async function getModelsByUser(userId: RecordId): Promise<ModelInfo[]> {
  const abandoned = await abandonedRunModelIds(userId);
  const allKeys = await ModelRepo.getAllKeys();
  const owned = (
    await Promise.all(
      allKeys.map(async (key) => {
        const record = await ModelRepo.find(key);
        if (record?.userId !== userId) return null;
        // Hide orphans from canceled/failed runs (created at run start, never
        // produced an artifact). An artifact-bearing model stays listed even
        // if a later re-run was canceled — it's still a real, usable model.
        if (!record.artifactRef && abandoned.has(key)) return null;
        return populateModelInfo(key);
      }),
    )
  ).filter((m): m is ModelInfo => m !== null);

  return owned.toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Deploy a model — creates a DeploymentRecord and loads it into the
 * inference service.
 */
export async function deployModel(
  user: UserWithId,
  modelId: RecordId,
  displayName?: string,
): Promise<DeploymentInfo> {
  const model = await ModelRepo.find(modelId);
  if (!model) throw new Error(`Model ${modelId} not found`);
  if (model.userId !== user.userId) {
    throw new Error(`User ${user.username} does not own model ${modelId}`);
  }
  if (!model.artifactRef) {
    throw new Error(`Model ${modelId} has no trained artifact yet`);
  }

  // CoS 2.7 cap
  const allDepKeys = await DeploymentRepo.getAllKeys();
  const activeCount = (await Promise.all(allDepKeys.map((key) => DeploymentRepo.find(key)))).filter(
    (r): r is DeploymentRecord =>
      r !== null &&
      r.userId === user.userId &&
      r.gameKey === model.gameKey &&
      r.status === "active",
  ).length;

  if (activeCount >= MAX_ACTIVE_DEPLOYMENTS_PER_GAME) {
    throw new Error(
      `You already have ${MAX_ACTIVE_DEPLOYMENTS_PER_GAME} active deployments for ` +
        `'${model.gameKey}'. Pause or retire one first (CoS 2.7).`,
    );
  }

  const now = new Date().toISOString();
  const deploymentId = await DeploymentRepo.add({
    modelId,
    userId: user.userId,
    gameKey: model.gameKey,
    displayName: displayName ?? model.displayName,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  // Load into inference service only when INFERENCE_SERVICE_URL is configured.
  // Best-effort: absence of the service never blocks a deploy on a dev machine
  // or in the demo environment. A 4xx from the service (bad model, unknown game)
  // is a real error and deletes the record so the list doesn't fill with junk.
  if (process.env["INFERENCE_SERVICE_URL"]) {
    try {
      await inferenceClient.loadModel({ deploymentId, game: model.gameKey, modelId });
    } catch (err) {
      const e = err as inferenceClient.InferenceError;
      const isClientError = typeof e.status === "number" && e.status >= 400 && e.status < 500;
      if (isClientError) {
        // Delete the record rather than leaving a retired ghost.
        const dep = await DeploymentRepo.find(deploymentId);
        if (dep) {
          dep.status = "retired";
          dep.updatedAt = new Date().toISOString();
          await DeploymentRepo.set(deploymentId, dep);
        }
        throw new Error(`Inference load failed: ${e.message}`);
      }
      // Connection error / 5xx — inference is down, proceed anyway.
      // eslint-disable-next-line no-console
      console.warn(`Inference service unreachable during deploy ${deploymentId}: ${e.message}`);
    }
  }

  return populateDeploymentInfo(deploymentId);
}

/**
 * Update deployment status. Retiring unloads from inference service.
 * Best-effort: connection errors and 5xx are swallowed so an unreachable
 * inference service never prevents a user from retiring a deployment.
 */
export async function updateDeploymentStatus(
  deploymentId: RecordId,
  user: UserWithId,
  newStatus: "active" | "paused" | "retired",
): Promise<DeploymentInfo> {
  const record = await DeploymentRepo.find(deploymentId);
  if (!record) throw new Error(`Deployment ${deploymentId} not found`);
  if (record.userId !== user.userId) {
    throw new Error(`User ${user.username} does not own deployment ${deploymentId}`);
  }

  if (newStatus === "retired") {
    try {
      await inferenceClient.unloadModel(deploymentId);
    } catch (err) {
      const e = err as inferenceClient.InferenceError;
      // Only rethrow real client errors (e.g. auth failures).
      // 404 = already unloaded (fine), 5xx / no status = service down (fine).
      if (typeof e.status === "number" && e.status >= 400 && e.status < 500 && e.status !== 404) {
        throw err;
      }
    }
  }

  record.status = newStatus;
  record.updatedAt = new Date().toISOString();
  await DeploymentRepo.set(deploymentId, record);
  return populateDeploymentInfo(deploymentId);
}
