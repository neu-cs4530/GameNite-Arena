/**
 * server/src/services/dataIntegrity.service.ts
 * ==============================================
 * Referential integrity for the trainer data web:
 *
 *   UserRecord <- ModelRecord <- TrainingJobRecord
 *                           ^--- DeploymentRecord
 *                           ^--- artifact file (artifactStore)
 *   UserRecord <- TrainingTokenRecord
 *
 * Keyv/Mongo enforces none of this — every link is just a string — so the
 * rules live here instead:
 *
 *  - assertOwnedModel() is the ONE ownership guard for model mutations.
 *    Write paths that act "on a user's model" go through it, so the
 *    not-found / not-owned semantics (and their HTTP mappings) stay
 *    identical everywhere.
 *  - auditTrainingDataIntegrity() walks every link and reports violations.
 *    The test suite runs it against healthy and deliberately-broken data;
 *    it is also importable anywhere a consistency check is useful (a debug
 *    endpoint, a migration's post-check, a cron).
 *
 * Read paths stay tolerant by design (populateOwner falls back to
 * "unknown" rather than 500ing); the audit is how drift gets SEEN instead
 * of silently tolerated forever.
 */

import type { ModelRecord, RecordId } from "../models.ts";
import {
  DeploymentRepo,
  ModelRepo,
  TrainingJobRepo,
  TrainingTokenRepo,
  UserRepo,
} from "../repository.ts";
import { resolveArtifactRef } from "./artifactStore.service.ts";
import type { UserWithId } from "../types.ts";

/**
 * The canonical "this user may act on this model" guard. Error messages are
 * load-bearing: controllers map /not found/ -> 404 and /not own/ -> 403.
 */
export async function assertOwnedModel(user: UserWithId, modelId: RecordId): Promise<ModelRecord> {
  const model = await ModelRepo.find(modelId);
  if (!model) throw new Error(`Model ${modelId} not found`);
  if (model.userId !== user.userId) {
    throw new Error(`User ${user.username} does not own model ${modelId}`);
  }
  return model;
}

export interface IntegrityViolation {
  kind:
    | "model-owner-missing"
    | "job-model-missing"
    | "job-owner-mismatch"
    | "deployment-model-missing"
    | "deployment-owner-mismatch"
    | "artifact-file-missing"
    | "token-owner-missing";
  /** Key of the record carrying the bad link. */
  recordId: string;
  detail: string;
}

/** Walk every trainer-data link and report what no longer holds. */
export async function auditTrainingDataIntegrity(): Promise<IntegrityViolation[]> {
  const violations: IntegrityViolation[] = [];

  const userKeys = new Set(await UserRepo.getAllKeys());

  /* models: owner must exist; a stored artifact ref must resolve */
  const modelKeys = await ModelRepo.getAllKeys();
  const models = new Map<string, ModelRecord>();
  for (const key of modelKeys) {
    const model = await ModelRepo.find(key);
    if (!model) continue;
    models.set(key, model);

    if (!userKeys.has(model.userId)) {
      violations.push({
        kind: "model-owner-missing",
        recordId: key,
        detail: `Model '${model.displayName}' references missing user ${model.userId}`,
      });
    }
    if (model.artifactRef && resolveArtifactRef(model.artifactRef) === null) {
      violations.push({
        kind: "artifact-file-missing",
        recordId: key,
        detail: `Model '${model.displayName}' artifactRef '${model.artifactRef}' has no file in the artifact store`,
      });
    }
  }

  /* training jobs: model must exist and share the owner */
  for (const key of await TrainingJobRepo.getAllKeys()) {
    const job = await TrainingJobRepo.find(key);
    if (!job) continue;
    const model = models.get(job.modelId);
    if (!model) {
      violations.push({
        kind: "job-model-missing",
        recordId: key,
        detail: `Training job references missing model ${job.modelId}`,
      });
      continue;
    }
    if (model.userId !== job.userId) {
      violations.push({
        kind: "job-owner-mismatch",
        recordId: key,
        detail: `Training job owner ${job.userId} differs from model owner ${model.userId}`,
      });
    }
  }

  /* deployments: model must exist and share the owner */
  for (const key of await DeploymentRepo.getAllKeys()) {
    const deployment = await DeploymentRepo.find(key);
    if (!deployment) continue;
    const model = models.get(deployment.modelId);
    if (!model) {
      violations.push({
        kind: "deployment-model-missing",
        recordId: key,
        detail: `Deployment '${deployment.displayName}' references missing model ${deployment.modelId}`,
      });
      continue;
    }
    if (model.userId !== deployment.userId) {
      violations.push({
        kind: "deployment-owner-mismatch",
        recordId: key,
        detail: `Deployment owner ${deployment.userId} differs from model owner ${model.userId}`,
      });
    }
  }

  /* live tokens: user must exist (expired tokens are inert, skip them) */
  for (const key of await TrainingTokenRepo.getAllKeys()) {
    const token = await TrainingTokenRepo.find(key);
    if (!token) continue;
    if (Date.parse(token.expiresAt) <= Date.now()) continue;
    if (!userKeys.has(token.userId)) {
      violations.push({
        kind: "token-owner-missing",
        recordId: key,
        detail: `Live training token for '${token.username}' references missing user ${token.userId}`,
      });
    }
  }

  return violations;
}
