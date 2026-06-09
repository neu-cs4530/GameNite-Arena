/**
 * Trainer training-job service functions.
 *
 * All MOCKED. Pattern mirrors `replayService`. Real `api.*` calls are commented
 * out for swap-in once the server endpoints land.
 */

import type {
  JobFilters,
  JobListPage,
  SubmitJobPayload,
  TrainingJobDetail,
  TrainingJobSummary,
  TrainingStreamEvent,
} from "../util/types.ts";
// import { api } from "./api.ts";
import {
  filterMockJobs,
  findMockJob,
  incrementJobViews,
  MOCK_JOBS,
  setJobStatus,
  subscribeMockProgress,
  trainerHoursAgo,
  trainingModeByGame,
} from "../__mocks__/training.ts";

const MOCK_LATENCY_MS = 80;
function delay<T>(value: T, ms = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/** Paginated, filtered job list. */
export async function listJobs(filters: JobFilters): Promise<JobListPage> {
  // TODO(@team): real endpoint pending — `GET /api/training/list`.
  const { jobs, total } = filterMockJobs(filters);
  return delay({ jobs, total, page: filters.page, pageSize: filters.pageSize });
}

/** Fetches full detail for one job. Increments the views counter. */
export async function getJob(jobId: string): Promise<TrainingJobDetail> {
  // TODO(@team): real endpoint pending — `GET /api/training/:jobId`.
  const job = findMockJob(jobId);
  if (!job) return Promise.reject(new Error(`Job not found: ${jobId}`));
  incrementJobViews(jobId);
  return delay({
    ...job,
    checkpoints: job.checkpoints.slice(),
    episodesSeries: job.episodesSeries.slice(),
    meanRewardSeries: job.meanRewardSeries.slice(),
    winRateSeries: job.winRateSeries.slice(),
  });
}

/** Submits a new training job. Returns the new job id. */
export async function submitJob(payload: SubmitJobPayload): Promise<{ jobId: string }> {
  // TODO(@team): real endpoint pending — `POST /api/training/submit`.
  const id = `mock-job-${MOCK_JOBS.length + 1}`;
  const modelId = payload.modelId ?? `mock-model-${id.replace("mock-job-", "")}`;
  const job: TrainingJobDetail = {
    id,
    modelId,
    modelDisplayName: payload.modelDisplayName,
    owner: { username: "user0", displayName: "The Knight Of Games" },
    gameKey: payload.gameKey,
    status: "queued",
    hyperparameters: payload.hyperparameters,
    progressEpisodes: 0,
    targetEpisodes: payload.hyperparameters.episodes,
    currentMeanReward: 0,
    currentWinRate: 0,
    createdAt: trainerHoursAgo(0),
    hasArtifact: false,
    hasCheckpoint: false,
    checkpoints: [],
    episodesSeries: [],
    meanRewardSeries: [],
    winRateSeries: [],
    views: 0,
    notifyOnComplete: payload.notifyOnComplete,
  };
  MOCK_JOBS.push(job);
  return delay({ jobId: id });
}

/** Cancels a running or queued job. */
export async function cancelJob(jobId: string): Promise<void> {
  // TODO(@team): real endpoint pending — `POST /api/training/:jobId/cancel`.
  setJobStatus(jobId, "canceled");
  return delay(undefined);
}

/** Returns a synthetic `.pth` artifact blob. */
export async function downloadArtifact(jobId: string): Promise<Blob> {
  // TODO(@team): real endpoint pending — `GET /api/training/:jobId/artifact`.
  const job = findMockJob(jobId);
  if (!job) return Promise.reject(new Error(`Job not found: ${jobId}`));
  if (!job.hasArtifact) return Promise.reject(new Error(`Job has no artifact: ${jobId}`));
  // Real `.pth` is binary; we just return a JSON sentinel so downloads work.
  const payload = JSON.stringify(
    {
      modelId: job.modelId,
      jobId: job.id,
      finalMetrics: {
        meanReward: job.currentMeanReward,
        winRate: job.currentWinRate,
      },
    },
    null,
    2,
  );
  return new Blob([payload], { type: "application/octet-stream" });
}

/** Subscribes to the live progress mock WebSocket. */
export function subscribeLiveProgress(
  jobId: string,
  cb: (event: TrainingStreamEvent) => void,
): () => void {
  // TODO(@team): real WebSocket pending — `ws://.../training/:jobId/progress`.
  return subscribeMockProgress(jobId, cb);
}

/** Computes the training mode for a game (self-play vs environment-driven). */
export function trainingModeForGame(
  gameKey: TrainingJobSummary["gameKey"],
): "self-play" | "environment-driven" {
  return trainingModeByGame[gameKey];
}

/** Tiny cost estimator used by the new-training-run form. */
export function estimateTrainingCost(episodes: number): {
  estimatedMinutes: number;
  estimatedCreditsPerHour: number;
  totalCredits: number;
  withinBudget: boolean;
} {
  // Rough heuristic: 1k episodes ~ 6 seconds, $1.20/hour.
  const estimatedMinutes = Math.max(1, Math.round((episodes / 1000) * 0.1));
  const estimatedCreditsPerHour = 120;
  const totalCredits = +(estimatedMinutes / 60) * estimatedCreditsPerHour;
  return {
    estimatedMinutes,
    estimatedCreditsPerHour,
    totalCredits: Math.round(totalCredits),
    withinBudget: episodes <= 5_000_000,
  };
}
