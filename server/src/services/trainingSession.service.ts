/* eslint no-console: "off" */
/**
 * server/src/services/trainingSession.service.ts
 * ================================================
 * Business logic for LOCAL training sessions (the scope-corrected Story 2.2/2.3):
 * the user's own machine runs the training loop and reports here over REST;
 * the platform records the run in TrainingJobRepo and fans progress out to the
 * dashboard through the Redis -> WebSocket bridge (trainingBridge.service.ts).
 *
 * Relationship to the queue-based path: trainingQueue.service.ts /
 * trainingWorker.ts remain available for server-managed runs. Both paths
 * write TrainingJobRecord and publish the same TrainingProgressEvent shape,
 * so the dashboard does not care where training actually happens.
 *
 * This module deliberately never imports redis.ts: the publisher is injected
 * at startup (server.ts) and absent in tests, keeping every endpoint usable
 * without Redis. The DB write is the source of truth; publishing is
 * best-effort on top.
 */

import type {
  StartTrainingSessionPayload,
  ReportTrainingProgressPayload,
  CompleteTrainingSessionPayload,
  FailTrainingSessionPayload,
  TrainingSessionInfo,
  TrainingSessionListPage,
  TrainingProgressEvent,
  GameKey,
} from "@gamenite/shared";
import type { RecordId, TrainingJobRecord } from "../models.ts";
import { ModelRepo, TrainingJobRepo, UserRepo } from "../repository.ts";
import {
  publishTrainingProgress,
  type ProgressPublisherClient,
} from "./trainingPublish.service.ts";
import { storeModelArtifact, resolveArtifactRef } from "./artifactStore.service.ts";
import { assertOwnedModel } from "./dataIntegrity.service.ts";
import type { UserWithId } from "../types.ts";

// Publisher injection

let publisher: ProgressPublisherClient | null = null;

/**
 * Wire the Redis client used to publish progress events. Called once at
 * startup (server.ts); left unset in tests and in environments without Redis.
 */
export function setTrainingSessionPublisher(client: ProgressPublisherClient | null): void {
  publisher = client;
}

/** Publish best-effort: a Redis hiccup must never fail the HTTP request. */
async function publishEvent(
  event: Omit<TrainingProgressEvent, "timestamp"> & { timestamp?: number },
): Promise<void> {
  if (!publisher) return;
  try {
    await publishTrainingProgress(publisher, event);
  } catch (err) {
    console.warn(`[training-session] progress publish failed for ${event.jobId}: ${String(err)}`);
  }
}

// Helpers

/**
 * The trainer-facing schemas accept all five arena games, but the starter
 * codebase's GameKey union is still "nim" | "guess" and the record types in
 * models.ts use it. The upload path (model.service.ts) established this same
 * narrowing; keep it in ONE visible place until shared zGameKey is widened.
 */
function toStoredGameKey(key: StartTrainingSessionPayload["gameKey"]): GameKey {
  return key as GameKey;
}

/**
 * Owner lookup that survives orphaned sessions (e.g. a record whose user was
 * reseeded away) — a missing user must never turn the public reads into 500s.
 */
async function populateOwner(userId: RecordId): Promise<{ username: string; display: string }> {
  const user = await UserRepo.find(userId);
  if (!user) return { username: "unknown", display: "Unknown user" };
  return { username: user.username, display: user.display };
}

async function populateSessionInfo(jobId: string): Promise<TrainingSessionInfo> {
  const job = await TrainingJobRepo.get(jobId);
  const model = await ModelRepo.find(job.modelId);
  const owner = await populateOwner(job.userId);
  return {
    jobId,
    modelId: job.modelId,
    modelDisplayName: model?.displayName ?? "unknown model",
    owner: { username: owner.username, display: owner.display },
    gameKey: job.gameKey,
    status: job.status,
    config: {
      episodes: job.config.episodes,
      learningRate: job.config.learningRate,
      extra: job.config.extra,
    },
    progress: job.progress,
    error: job.error,
    hasArtifact: Boolean(model?.artifactRef),
    artifactMeta: model?.artifactMeta,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  };
}

async function getOwnedSession(user: UserWithId, jobId: string): Promise<TrainingJobRecord> {
  const job = await TrainingJobRepo.find(jobId);
  if (!job) throw new Error(`Training session ${jobId} not found`);
  if (job.userId !== user.userId) {
    throw new Error(`User ${user.username} does not own training session ${jobId}`);
  }
  return job;
}

function isTerminal(status: TrainingJobRecord["status"]): boolean {
  return status === "completed" || status === "failed" || status === "canceled";
}

function assertNotTerminal(jobId: string, job: TrainingJobRecord): void {
  if (isTerminal(job.status)) {
    throw new Error(`Training session ${jobId} already ${job.status}`);
  }
}

/**
 * Re-read immediately before writing. Progress posts (trainer machine) and
 * cancels (web UI) are concurrent BY DESIGN, and a stale read-modify-write
 * must never resurrect a terminal session — that would silently defeat the
 * cancel control channel. Returns the fresh record to mutate, or null when a
 * terminal transition landed mid-flight.
 */
async function refreshForWrite(jobId: string): Promise<TrainingJobRecord | null> {
  const fresh = await TrainingJobRepo.find(jobId);
  if (!fresh || isTerminal(fresh.status)) return null;
  return fresh;
}

// Service functions

/**
 * Register a new local training session. Creates the TrainingJobRecord in
 * "queued" state — the first progress report flips it to "running". When no
 * modelId is given a fresh private ModelRecord is created; its sourceRef is
 * the sentinel "local-training" since the source stays on the user's machine.
 */
export async function startTrainingSession(
  user: UserWithId,
  payload: StartTrainingSessionPayload,
): Promise<TrainingSessionInfo> {
  const now = new Date().toISOString();

  let modelId = payload.modelId;
  if (modelId) {
    const model = await assertOwnedModel(user, modelId);
    if (model.gameKey !== toStoredGameKey(payload.gameKey)) {
      throw new Error(
        `Game key '${payload.gameKey}' does not match the model's game '${model.gameKey}'`,
      );
    }
  } else {
    modelId = await ModelRepo.add({
      userId: user.userId,
      gameKey: toStoredGameKey(payload.gameKey),
      displayName: payload.modelDisplayName?.trim() || `${payload.gameKey}-local-model`,
      sourceRef: "local-training",
      visibility: "private",
      createdAt: now,
      updatedAt: now,
    });
  }

  const jobId = await TrainingJobRepo.add({
    modelId,
    userId: user.userId,
    gameKey: toStoredGameKey(payload.gameKey),
    config: {
      episodes: payload.config.episodes,
      learningRate: payload.config.learningRate,
      extra: payload.config.extra,
    },
    status: "queued",
    progress: { episodes: 0, meanReward: 0, winRate: 0, updatedAt: now },
    checkpoints: [],
    createdAt: now,
  });

  await publishEvent({
    jobId,
    modelId,
    status: "queued",
    totalEpochs: payload.config.episodes,
    message: "Session registered — waiting for the local trainer",
  });

  return populateSessionInfo(jobId);
}

/**
 * Record one progress report from the local trainer and fan it out.
 *
 * Cancellation control channel: if the session was canceled from the web UI
 * the report is NOT applied and the canceled info is returned — the local
 * trainer checks the status in the response and stops its loop.
 */
export async function reportTrainingProgress(
  user: UserWithId,
  jobId: string,
  payload: ReportTrainingProgressPayload,
): Promise<TrainingSessionInfo> {
  const job = await getOwnedSession(user, jobId);

  if (job.status === "canceled") return populateSessionInfo(jobId);
  if (job.status === "completed" || job.status === "failed") {
    throw new Error(`Training session ${jobId} already ${job.status}`);
  }

  // Re-read before the write: a cancel may have landed since our first read,
  // and clobbering it would tell the trainer to keep going forever.
  const fresh = await refreshForWrite(jobId);
  if (!fresh) return populateSessionInfo(jobId);

  const now = new Date().toISOString();
  fresh.status = "running";
  fresh.progress = {
    episodes: payload.episodes,
    meanReward: payload.metrics?.meanReward ?? 0,
    winRate: payload.metrics?.winRate ?? 0,
    updatedAt: now,
  };
  await TrainingJobRepo.set(jobId, fresh);

  const fraction =
    fresh.config.episodes > 0 ? Math.min(1, payload.episodes / fresh.config.episodes) : 0;
  await publishEvent({
    jobId,
    modelId: fresh.modelId,
    status: "running",
    progress: fraction,
    epoch: payload.episodes,
    totalEpochs: fresh.config.episodes,
    metrics: payload.metrics,
    message: payload.message,
  });

  return populateSessionInfo(jobId);
}

/** Mark the session completed (final metrics fold into the stored progress). */
export async function completeTrainingSession(
  user: UserWithId,
  jobId: string,
  payload: CompleteTrainingSessionPayload,
): Promise<TrainingSessionInfo> {
  const job = await getOwnedSession(user, jobId);
  assertNotTerminal(jobId, job);

  const fresh = await refreshForWrite(jobId);
  if (!fresh) {
    const current = await TrainingJobRepo.get(jobId);
    throw new Error(`Training session ${jobId} already ${current.status}`);
  }

  const now = new Date().toISOString();
  fresh.status = "completed";
  fresh.completedAt = now;
  if (payload.finalMetrics) {
    fresh.progress = {
      ...fresh.progress,
      meanReward: payload.finalMetrics.meanReward ?? fresh.progress.meanReward,
      winRate: payload.finalMetrics.winRate ?? fresh.progress.winRate,
      updatedAt: now,
    };
  }
  await TrainingJobRepo.set(jobId, fresh);

  await publishEvent({
    jobId,
    modelId: fresh.modelId,
    status: "completed",
    progress: 1,
    epoch: fresh.progress.episodes,
    totalEpochs: fresh.config.episodes,
    metrics: payload.finalMetrics,
    message: payload.message ?? "Training complete",
  });

  return populateSessionInfo(jobId);
}

/** Mark the session failed with the trainer-reported error. */
export async function failTrainingSession(
  user: UserWithId,
  jobId: string,
  payload: FailTrainingSessionPayload,
): Promise<TrainingSessionInfo> {
  const job = await getOwnedSession(user, jobId);
  assertNotTerminal(jobId, job);

  const fresh = await refreshForWrite(jobId);
  if (!fresh) {
    const current = await TrainingJobRepo.get(jobId);
    throw new Error(`Training session ${jobId} already ${current.status}`);
  }

  fresh.status = "failed";
  fresh.error = payload.error;
  fresh.completedAt = new Date().toISOString();
  await TrainingJobRepo.set(jobId, fresh);

  await publishEvent({
    jobId,
    modelId: fresh.modelId,
    status: "failed",
    message: payload.error,
  });

  return populateSessionInfo(jobId);
}

/**
 * Cancel a queued/running session (from the web UI).
 *
 * No progress event is published: the bridge contract's TrainingStatus has no
 * "canceled" member (trainingProgress.types.ts). The canceling client
 * refetches after the call, and the local trainer learns from its next
 * progress response. Known limitation: a second, already-subscribed viewer
 * keeps the stale last event until it refetches.
 */
export async function cancelTrainingSession(
  user: UserWithId,
  jobId: string,
): Promise<TrainingSessionInfo> {
  const job = await getOwnedSession(user, jobId);
  assertNotTerminal(jobId, job);

  const fresh = await refreshForWrite(jobId);
  if (!fresh) {
    const current = await TrainingJobRepo.get(jobId);
    throw new Error(`Training session ${jobId} already ${current.status}`);
  }

  fresh.status = "canceled";
  fresh.completedAt = new Date().toISOString();
  await TrainingJobRepo.set(jobId, fresh);

  return populateSessionInfo(jobId);
}

/**
 * Bind an uploaded .pth to the session's model (CoS 2.4). The upload is
 * moved into the artifact store under the canonical `<modelId>.pth` name —
 * the layout the inference service deploys from — and integrity metadata
 * is recorded on the model.
 */
export async function bindSessionArtifact(
  user: UserWithId,
  jobId: string,
  uploadedPath: string,
): Promise<TrainingSessionInfo> {
  const job = await getOwnedSession(user, jobId);

  const model = await ModelRepo.find(job.modelId);
  if (!model) throw new Error(`Model ${job.modelId} not found`);

  const stored = await storeModelArtifact(job.modelId, uploadedPath);
  model.artifactRef = stored.ref;
  model.artifactMeta = {
    bytes: stored.bytes,
    sha256: stored.sha256,
    uploadedAt: stored.storedAt,
  };
  model.updatedAt = stored.storedAt;
  await ModelRepo.set(job.modelId, model);

  return populateSessionInfo(jobId);
}

/**
 * Absolute path of the session's stored artifact, or null if none. Resolves
 * through the artifact store, so a ref can never point outside it.
 */
export async function getSessionArtifactPath(jobId: string): Promise<string | null> {
  const job = await TrainingJobRepo.find(jobId);
  if (!job) return null;
  const model = await ModelRepo.find(job.modelId);
  return resolveArtifactRef(model?.artifactRef);
}

/** Public read of one session. */
export async function getTrainingSession(jobId: string): Promise<TrainingSessionInfo | null> {
  const job = await TrainingJobRepo.find(jobId);
  if (!job) return null;
  return populateSessionInfo(jobId);
}

/** Newest-first session list, optionally filtered to one owner. */
export async function listTrainingSessions(opts: {
  username?: string;
  page?: number;
  pageSize?: number;
}): Promise<TrainingSessionListPage> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));

  const keys = await TrainingJobRepo.getAllKeys();
  const all = await Promise.all(keys.map((key) => populateSessionInfo(key)));

  const filtered = opts.username
    ? all.filter((info) => info.owner.username === opts.username)
    : all;
  filtered.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return {
    jobs: filtered.slice((page - 1) * pageSize, page * pageSize),
    total: filtered.length,
    page,
    pageSize,
  };
}
