import type { TrainingSessionInfo } from "@gamenite/shared";
import type { TrainingJobDetail, TrainingJobSummary } from "../util/types.ts";

/**
 * Maps the server's local-training session projection onto the client job
 * shapes. The mapping must stay TOTAL: every field the trainer pages
 * dereference without guards gets an explicit value here, because the server
 * legitimately does not track some of them (views, curve series,
 * checkpoints) — the curve accumulates client-side from live progress
 * events instead (see useLiveTrainingProgress).
 */
export function mapSessionToJobDetail(info: TrainingSessionInfo): TrainingJobDetail {
  return {
    id: info.jobId,
    modelId: info.modelId,
    modelDisplayName: info.modelDisplayName,
    owner: { username: info.owner.username, displayName: info.owner.display },
    gameKey: info.gameKey,
    status: info.status,
    hyperparameters: {
      episodes: info.config.episodes,
      learningRate: info.config.learningRate,
      extraConfig: info.config.extra,
    },
    progressEpisodes: info.progress.episodes,
    targetEpisodes: info.config.episodes,
    currentMeanReward: info.progress.meanReward,
    currentWinRate: info.progress.winRate,
    createdAt: info.createdAt,
    startedAt: undefined,
    completedAt: info.completedAt,
    hasArtifact: info.hasArtifact,
    artifactMeta: info.artifactMeta,
    error: info.error,
    hasCheckpoint: false,
    checkpoints: [],
    episodesSeries: [],
    meanRewardSeries: [],
    winRateSeries: [],
    views: 0,
  };
}

/** List rows use the summary subset; the detail shape satisfies it. */
export function mapSessionToJobSummary(info: TrainingSessionInfo): TrainingJobSummary {
  return mapSessionToJobDetail(info);
}

/**
 * The session as the platform knows it: strips the client-only fields the
 * mapper fills with defaults (views, checkpoint/series placeholders) so the
 * "raw session data" panels never present an invented value as recorded.
 */
export function rawSessionView(job: TrainingJobDetail): Record<string, unknown> {
  const {
    views: _views,
    hasCheckpoint: _hasCheckpoint,
    checkpoints: _checkpoints,
    episodesSeries: _episodesSeries,
    meanRewardSeries: _meanRewardSeries,
    winRateSeries: _winRateSeries,
    startedAt: _startedAt,
    ...recorded
  } = job;
  return recorded;
}
