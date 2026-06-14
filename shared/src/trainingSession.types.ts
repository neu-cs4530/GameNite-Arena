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
import { zUserAuth } from "./auth.types.ts";

/* --- Trainer auth ------------------------------------------------------ */

/**
 * The local trainer exchanges its password ONCE (POST /api/training/token)
 * for an expiring session token and authenticates every subsequent call with
 * it, so the password never sits in loops, logs, or long-running processes.
 * Web-UI calls may keep using the username/password shape — both are valid
 * on every training route.
 */
export const zTrainingTokenAuth = z.object({ token: z.string().min(16).max(128) });
export type TrainingTokenAuth = z.infer<typeof zTrainingTokenAuth>;

export const zTrainingAuth = z.union([zUserAuth, zTrainingTokenAuth]);
export type TrainingAuth = z.infer<typeof zTrainingAuth>;

/** Like auth.types.ts withAuth(), but accepting password OR token auth. */
export function withTrainingAuth<T extends z.ZodType>(
  zT: T,
): z.ZodObject<{ auth: typeof zTrainingAuth; payload: T }> {
  return z.object({ auth: zTrainingAuth, payload: zT });
}

/** Response of POST /api/training/token. */
export interface TrainingTokenInfo {
  token: string;
  username: string;
  /** ISO timestamp; the token stops working after this. */
  expiresAt: string;
}

/**
 * Games a model can be trained for. Mirrors the trainer/replay surfaces in
 * the client. Note the ai-SDK examples call the number guesser "numguesser";
 * the platform key for that game is "guess".
 */
export const zTrainerGameKey = z.enum(["nim", "guess", "checkers", "connect4", "tictactoe"]);
export type TrainerGameKey = z.infer<typeof zTrainerGameKey>;

/** Lifecycle of a training session (mirrors TrainingJobRecord.status). */
export type TrainingSessionStatus = "queued" | "running" | "completed" | "failed" | "canceled";

/**
 * Open numeric metric bag, bounded so a buggy or hostile trainer cannot
 * balloon stored records and fan-out events (these flow verbatim to every
 * dashboard subscriber and into the Redis snapshot).
 */
const zMetricBag = z
  .record(z.string().max(64), z.number())
  .refine((bag) => Object.keys(bag).length <= 64, { message: "Too many metric keys (max 64)" });

export const zTrainingSessionConfig = z.object({
  episodes: z.number().int().min(1),
  learningRate: z.number().gt(0).lte(1),
  /** Open-shape extra hyperparameters; the local trainer interprets these. */
  extra: z
    .record(z.string().max(64), z.unknown())
    .refine((bag) => Object.keys(bag).length <= 32, { message: "Too many extra keys (max 32)" })
    .optional(),
});
export type TrainingSessionConfig = z.infer<typeof zTrainingSessionConfig>;

/**
 * POST /api/training/submit — register a session before the local loop
 * starts. With `modelId` the run continues an existing owned model;
 * without it a fresh private model is created (named `modelDisplayName`,
 * or a per-game default).
 *
 * `checkpointModelId` — optional. When provided the session service resolves
 * that model's stored artifact and includes its download URL in the session
 * config `extra.checkpointJobId`. The local trainer calls
 * GET /api/training/:checkpointJobId/artifact to fetch it before training.
 * CoS 2.10: resume training from a saved checkpoint.
 */
export const zStartTrainingSession = z.object({
  gameKey: zTrainerGameKey,
  modelId: z.string().max(128).optional(),
  modelDisplayName: z.string().max(120).optional(),
  config: zTrainingSessionConfig,
  /** Model whose stored .pth should be used as a starting checkpoint. */
  checkpointModelId: z.string().max(128).optional(),
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
  metrics: zMetricBag.optional(),
  message: z.string().max(2000).optional(),
});
export type ReportTrainingProgressPayload = z.infer<typeof zReportTrainingProgress>;

/** POST /api/training/:jobId/complete */
export const zCompleteTrainingSession = z.object({
  finalMetrics: zMetricBag.optional(),
  message: z.string().max(2000).optional(),
});
export type CompleteTrainingSessionPayload = z.infer<typeof zCompleteTrainingSession>;

/**
 * POST /api/training/:jobId/fail
 *
 * Heads-up: like the rest of TrainingSessionInfo, the error string is served
 * by the PUBLIC session reads — send a failure summary, not a stack trace
 * with machine paths in it.
 */
export const zFailTrainingSession = z.object({
  error: z.string().min(1).max(4000),
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
  /** Integrity metadata recorded when the artifact was stored. */
  artifactMeta?: { bytes: number; sha256: string; uploadedAt: string };
  /**
   * When the session was started with checkpointModelId, this is the jobId
   * whose artifact the local trainer should download before training.
   * CoS 2.10.
   */
  checkpointJobId?: string;
  createdAt: string;
  completedAt?: string;
}

export interface TrainingSessionListPage {
  jobs: TrainingSessionInfo[];
  total: number;
  page: number;
  pageSize: number;
}
