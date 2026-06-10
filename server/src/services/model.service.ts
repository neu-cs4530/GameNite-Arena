/**
 *
 * Business logic for AI model upload, validation, and deployment management.
 * Uses ModelRecord (trained artifact) + DeploymentRecord (runtime slot).
 *
 * Sprint 2 changes (local train + upload decision):
 *   - uploadModel: uploads .pth to R2 (objectStorage) instead of keeping local path.
 *     artifactRef is now the R2 object key, not a local filesystem path.
 *   - deployModel: calls inferenceClient.loadModel() after creating the
 *     DeploymentRecord so the inference service actually loads the model.
 *   - updateDeploymentStatus: calls inferenceClient.unloadModel() on retire.
 */

import * as fs from "node:fs";
import type { GameKey } from "@gamenite/shared";
import type { DeploymentRecord, RecordId } from "../models.ts";
import { ModelRepo, DeploymentRepo } from "../repository.ts";
import { populateSafeUserInfo } from "./user.service.ts";
import type { UserWithId } from "../types.ts";
import * as objectStorage from "./objectStorage.ts";
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
 * Validate and store an uploaded .pth artifact as a ModelRecord.
 *
 * Sprint 2: uploads the .pth to R2 and stores the object key as artifactRef,
 * replacing the old local-path approach. The local temp file is always cleaned
 * up after upload (success or failure).
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
  // Validate game key
  if (!SUPPORTED_GAME_KEYS.includes(metadata.game as GameKey)) {
    fs.unlinkSync(filePath);
    throw new Error(
      `Unsupported game '${metadata.game}'. Supported: ${SUPPORTED_GAME_KEYS.join(", ")}`,
    );
  }

  // Validate adapter version
  if (metadata.adapterVersion !== CURRENT_ADAPTER_VERSION) {
    fs.unlinkSync(filePath);
    throw new Error(
      `Adapter version mismatch: model=${metadata.adapterVersion}, ` +
        `current=${CURRENT_ADAPTER_VERSION}. Please retrain with the latest adapter.`,
    );
  }

  // Upload to R2 — key includes userId so artifacts are namespaced per user.
  const objectKey = `models/${user.userId}/${Date.now()}-${metadata.game}.pth`;
  try {
    await objectStorage.uploadFile(filePath, objectKey);
  } finally {
    // Always remove the multer temp file, whether upload succeeded or not.
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* already gone */
    }
  }

  const now = new Date().toISOString();
  const modelId = await ModelRepo.add({
    userId: user.userId,
    gameKey: metadata.game as GameKey,
    displayName: displayName.trim() || `${metadata.game}-model`,
    sourceRef: objectKey,
    artifactRef: objectKey, // R2 object key, not a local path
    visibility: "private",
    createdAt: now,
    updatedAt: now,
  });

  return populateModelInfo(modelId);
}

/**
 * Retrieve a single model by ID.
 */
export async function getModelById(modelId: RecordId): Promise<ModelInfo | null> {
  const record = await ModelRepo.find(modelId);
  if (!record) return null;
  return populateModelInfo(modelId);
}

/**
 * Retrieve all models owned by a specific user, reverse chronological.
 */
export async function getModelsByUser(userId: RecordId): Promise<ModelInfo[]> {
  const allKeys = await ModelRepo.getAllKeys();
  const owned = (
    await Promise.all(
      allKeys.map(async (key) => {
        const record = await ModelRepo.find(key);
        if (record?.userId === userId) return populateModelInfo(key);
        return null;
      }),
    )
  ).filter((m): m is ModelInfo => m !== null);

  return owned.toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Deploy a model — creates a DeploymentRecord and loads it into the inference
 * service. Sprint 2: adds the inferenceClient.loadModel() call so the model
 * is actually available to serve moves.
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

  // Enforce per-user per-game cap (CoS 2.7)
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

  // Load the model into the inference service (storage -> inference handoff, #27).
  // If this fails, roll back the DeploymentRecord so the DB stays consistent.
  try {
    await inferenceClient.loadModel({
      deploymentId,
      game: model.gameKey,
      storageKey: model.artifactRef,
    });
  } catch (err) {
    // Roll back: mark the deployment as retired so it doesn't appear as active.
    const dep = await DeploymentRepo.find(deploymentId);
    if (dep) {
      dep.status = "retired";
      dep.updatedAt = new Date().toISOString();
      await DeploymentRepo.set(deploymentId, dep);
    }
    throw new Error(`Deployment created but inference load failed: ${(err as Error).message}`);
  }

  return populateDeploymentInfo(deploymentId);
}

/**
 * Update deployment status (pause, retire). Owner only (CoS 2.9).
 * Retiring unloads the model from the inference service.
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

  // Unload from inference service when retiring (CoS 2.9).
  // Best-effort: if inference already dropped it, that's fine.
  if (newStatus === "retired") {
    try {
      await inferenceClient.unloadModel(deploymentId);
    } catch (err) {
      if ((err as inferenceClient.InferenceError).status !== 404) throw err;
    }
  }

  record.status = newStatus;
  record.updatedAt = new Date().toISOString();
  await DeploymentRepo.set(deploymentId, record);
  return populateDeploymentInfo(deploymentId);
}
