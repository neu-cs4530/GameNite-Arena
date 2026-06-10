/**
 * Trainer training-job service functions.
 *
 * Two transports:
 *  - MOCK (default): deterministic fixtures, used by the Playwright e2e suite.
 *  - REAL (`VITE_REAL_TRAINING=1` at dev-server start): the local-training
 *    session API (`/api/training/...`) plus the socket.io progress bridge.
 *    Sessions are normally created by a run on the user's machine via
 *    `ai/session_reporter.py`; see docs/local-training.md.
 */

import { io as connectSocket, type Socket } from "socket.io-client";
import {
  SocketEvents,
  type TrainingSessionInfo,
  type TrainingSessionListPage,
  type UserAuth,
} from "@gamenite/shared";
import type {
  JobFilters,
  JobListPage,
  SubmitJobPayload,
  TrainingJobDetail,
  TrainingJobSummary,
  TrainingStreamEvent,
} from "../util/types.ts";
import { api } from "./api.ts";
import { mapSessionToJobDetail, mapSessionToJobSummary } from "./trainingMapper.ts";
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

/**
 * Build-time switch: `VITE_REAL_TRAINING=1 npm run dev` serves the trainer
 * pages off the real session API. Baked in at dev-server start (Vite env),
 * so kill a flagged dev server before running the e2e suite locally —
 * Playwright reuses an existing server on :4530 and the suite asserts on
 * mock fixture ids.
 */
export const USING_REAL_TRAINING_API = import.meta.env.VITE_REAL_TRAINING === "1";

/** Lazy socket dedicated to training progress (the app socket lives in App.tsx). */
let trainingSocket: Socket | null = null;
function getTrainingSocket(): Socket {
  if (trainingSocket === null) trainingSocket = connectSocket();
  return trainingSocket;
}

const MOCK_LATENCY_MS = 80;
function delay<T>(value: T, ms = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/** Pull the server's {error} body out of an axios rejection, if present. */
function extractApiError(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "response" in err) {
    const data = (err as { response?: { data?: { error?: string } } }).response?.data;
    if (data?.error) return data.error;
  }
  return err instanceof Error ? err.message : fallback;
}

/** Paginated, filtered job list. */
export async function listJobs(filters: JobFilters): Promise<JobListPage> {
  if (USING_REAL_TRAINING_API) {
    const { data } = await api.get<TrainingSessionListPage>("/api/training/list", {
      params: { username: filters.viewerUsername, pageSize: 100 },
    });
    // The server returns newest-first; statuses/games are the filters the
    // dashboard tabs actually use, so those are applied here and the rest of
    // the rich mock-side filtering is a non-goal in real mode.
    let jobs: TrainingJobSummary[] = data.jobs.map(mapSessionToJobSummary);
    if (filters.statuses.length > 0) {
      jobs = jobs.filter((job) => filters.statuses.includes(job.status));
    }
    if (filters.games.length > 0) {
      jobs = jobs.filter((job) => filters.games.includes(job.gameKey));
    }
    const start = (filters.page - 1) * filters.pageSize;
    return {
      jobs: jobs.slice(start, start + filters.pageSize),
      total: jobs.length,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  }
  const { jobs, total } = filterMockJobs(filters);
  return delay({ jobs, total, page: filters.page, pageSize: filters.pageSize });
}

/** Fetches full detail for one job. Increments the views counter (mock only). */
export async function getJob(jobId: string): Promise<TrainingJobDetail> {
  if (USING_REAL_TRAINING_API) {
    const { data } = await api.get<TrainingSessionInfo>(`/api/training/${jobId}`);
    return mapSessionToJobDetail(data);
  }
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

/**
 * Submits a new training job. Returns the new job id.
 *
 * Real mode registers a session that sits "queued" until a local trainer
 * picks the model up and starts reporting (`ai/session_reporter.py` with
 * `model_id`); `auth` is required for the real path and ignored by the mock.
 */
export async function submitJob(
  payload: SubmitJobPayload,
  auth?: UserAuth,
): Promise<{ jobId: string }> {
  if (USING_REAL_TRAINING_API && auth) {
    try {
      const { data } = await api.post<TrainingSessionInfo>("/api/training/submit", {
        auth,
        payload: {
          gameKey: payload.gameKey,
          modelId: payload.modelId,
          modelDisplayName: payload.modelDisplayName,
          config: {
            episodes: payload.hyperparameters.episodes,
            learningRate: payload.hyperparameters.learningRate,
            extra: payload.hyperparameters.extraConfig,
          },
        },
      });
      return { jobId: data.jobId };
    } catch (err) {
      throw new Error(extractApiError(err, "Could not register the training session"));
    }
  }
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

/**
 * Cancels a running or queued job. The local trainer finds out on its next
 * progress report (the response status is the cancel control channel);
 * `auth` is required for the real path and ignored by the mock.
 */
export async function cancelJob(jobId: string, auth?: UserAuth): Promise<void> {
  if (USING_REAL_TRAINING_API && auth) {
    await api.post(`/api/training/${jobId}/cancel`, { auth, payload: {} });
    return;
  }
  setJobStatus(jobId, "canceled");
  return delay(undefined);
}

/** Returns the trained `.pth` artifact blob. */
export async function downloadArtifact(jobId: string): Promise<Blob> {
  if (USING_REAL_TRAINING_API) {
    const { data } = await api.get<Blob>(`/api/training/${jobId}/artifact`, {
      responseType: "blob",
    });
    return data;
  }
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

/**
 * Subscribes to live progress. Real mode joins the per-job socket.io room
 * served by the training progress bridge (trainingBridge.service.ts) and
 * receives the snapshot replay plus every later event; the unsubscribe
 * callback leaves the room and detaches the listener.
 */
export function subscribeLiveProgress(
  jobId: string,
  cb: (event: TrainingStreamEvent) => void,
): () => void {
  if (USING_REAL_TRAINING_API) {
    const socket = getTrainingSocket();
    const handler = (event: TrainingStreamEvent) => {
      if (event.jobId === jobId) cb(event);
    };
    socket.on(SocketEvents.progress, handler);
    socket.emit(SocketEvents.subscribe, { jobId });
    return () => {
      socket.emit(SocketEvents.unsubscribe, { jobId });
      socket.off(SocketEvents.progress, handler);
    };
  }
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
