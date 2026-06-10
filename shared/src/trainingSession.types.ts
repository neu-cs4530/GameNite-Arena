/**
 * Wire contract for LOCAL training sessions.
 *
 * GameNite Arena does not train models server-side: users run training on
 * their own machines (see `ai/base_adapter.py` and `ai/session_reporter.py`)
 * and the platform records and displays the run. These types define the REST
 * payloads the local trainer sends to `/api/training/...` and the session
 * projection the dashboard reads back.
 *
 * Live fan-out reuses the `TrainingProgressEvent` contract from
 * `trainingProgress.types.ts`: the session service publishes events on the
 * same Redis channel the WebSocket bridge subscribes to, so the dashboard
 * sees a local run exactly the way it would see any other progress source.
 */

import { z } from "zod";

/**
 * Games a model can be trained for. Mirrors the trainer/replay surfaces in
 * the client. Note the ai-SDK examples call the number guesser "numguesser";
 * the platform key for that game is "guess".
 */
export const zTrainerGameKey = z.enum(["nim", "guess", "checkers", "connect4", "tictactoe"]);
export type TrainerGameKey = z.infer<typeof zTrainerGameKey>;

/** Lifecycle of a training session (mirrors TrainingJobRecord.status). */
export type TrainingSessionStatus = "queued" | "running" | "completed" | "failed" | "canceled";

export const zTrainingSessionConfig = z.object({
  episodes: z.number().int().min(1),
  learningRate: z.number().gt(0).lte(1),
  /** Open-shape extra hyperparameters; the local trainer interprets these. */
  extra: z.record(z.string(), z.unknown()).optional(),
});
export type TrainingSessionConfig = z.infer<typeof zTrainingSessionConfig>;

/**
 * POST /api/training/submit — register a session before the local loop
 * starts. With `modelId` the run continues an existing owned model;
 * without it a fresh private model is created (named `modelDisplayName`,
 * or a per-game default).
 */
export const zStartTrainingSession = z.object({
  gameKey: zTrainerGameKey,
  modelId: z.string().optional(),
  modelDisplayName: z.string().optional(),
  config: zTrainingSessionConfig,
});
export type StartTrainingSessionPayload = z.infer<typeof zStartTrainingSession>;

/**
 * POST /api/training/:jobId/progress — one report per episode batch.
 * The response carries the session's current status: a local trainer that
 * sees "canceled" should stop the loop (that response IS the cancel
 * control channel — there is no push channel back to the trainer).
 */
export const zReportTrainingProgress = z.object({
  episodes: z.number().int().min(0),
  /** Open numeric metric bag; meanReward and winRate are surfaced in the UI. */
  metrics: z.record(z.string(), z.number()).optional(),
  message: z.string().optional(),
});
export type ReportTrainingProgressPayload = z.infer<typeof zReportTrainingProgress>;

/** POST /api/training/:jobId/complete */
export const zCompleteTrainingSession = z.object({
  finalMetrics: z.record(z.string(), z.number()).optional(),
  message: z.string().optional(),
});
export type CompleteTrainingSessionPayload = z.infer<typeof zCompleteTrainingSession>;

/** POST /api/training/:jobId/fail */
export const zFailTrainingSession = z.object({
  error: z.string().min(1),
});
export type FailTrainingSessionPayload = z.infer<typeof zFailTrainingSession>;

/** Session projection served by the /api/training endpoints. */
export interface TrainingSessionInfo {
  jobId: string;
  modelId: string;
  modelDisplayName: string;
  owner: { username: string; display: string };
  gameKey: TrainerGameKey;
  status: TrainingSessionStatus;
  config: TrainingSessionConfig;
  progress: { episodes: number; meanReward: number; winRate: number; updatedAt: string };
  /** Set when status is "failed". */
  error?: string;
  /** True once a trained .pth has been uploaded and bound to the model. */
  hasArtifact: boolean;
  createdAt: string;
  completedAt?: string;
}

export interface TrainingSessionListPage {
  jobs: TrainingSessionInfo[];
  total: number;
  page: number;
  pageSize: number;
}
