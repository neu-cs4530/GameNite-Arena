/**
 * Deterministic mock fixture for the trainer-related service layer.
 *
 * The trainer e2e test suite asserts specific invariants against this file:
 *  - At least 40 models, first 12 owned by user0, first id is "mock-model-1".
 *  - First model is user0-owned, public, Nim, has a deployment + a checkpoint.
 *  - At least 12 training jobs spanning every status; first id "mock-job-1" is
 *    a COMPLETED user0 Nim job with a downloadable artifact. One job has id
 *    "mock-job-running" with status === "running" and partial progress.
 *  - At least 4 deployments for user0 across active / paused / retired.
 *    Game `connect4` has exactly 3 active for user0 (full cap).
 *  - Hello world template source contains `def choose_move`.
 *
 * Treat this file as a contract; the test agent depends on it.
 */

import {
  defaultModelFilters,
  defaultJobFilters,
  defaultDeploymentFilters,
  DeploymentCapExceededError,
  type CheckpointSummary,
  type DeploymentDetail,
  type DeploymentFilters,
  type DeploymentSummary,
  type JobFilters,
  type ModelDetail,
  type ModelFilters,
  type ModelSummary,
  type TrainerGameKey,
  type TrainerOwnerRef,
  type TrainingJobDetail,
  type TrainingJobSummary,
  type TrainingMode,
  type TrainingStreamEvent,
} from "../util/types.ts";
import { tierFromRating } from "../util/tiers.ts";

const NOW = new Date("2026-06-05T18:00:00.000Z");

export const trainerFixtureNow = NOW;
export const DEPLOYMENT_CAP_PER_GAME = 3;

export function trainerDaysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

export function trainerHoursAgo(n: number): string {
  return new Date(NOW.getTime() - n * 60 * 60 * 1000).toISOString();
}

export function trainerMinutesAgo(n: number): string {
  return new Date(NOW.getTime() - n * 60 * 1000).toISOString();
}

/** Self-play vs environment-driven mapping from the spec. */
export const trainingModeByGame: Record<TrainerGameKey, TrainingMode> = {
  nim: "self-play",
  guess: "environment-driven",
  checkers: "self-play",
  connect4: "self-play",
  tictactoe: "self-play",
};

/* ----------------------------------------------------------------------------
 * Owners (canonical entities reused across models / jobs / deployments)
 * ------------------------------------------------------------------------- */

function owner(username: string, displayName: string): TrainerOwnerRef {
  return { username, displayName };
}

const ownerUser0 = owner("user0", "The Knight Of Games");
const ownerUser1 = owner("user1", "Yáo Èr");
const ownerUser2 = owner("user2", "Sénior Dos");
const ownerUser3 = owner("user3", "Frau Drei");
const ownerUser4 = owner("user4", "Vier");
const ownerUser5 = owner("user5", "Cinq");

/* ----------------------------------------------------------------------------
 * Models
 * ------------------------------------------------------------------------- */

export const MOCK_MODELS: ModelDetail[] = [];

function pushModel(detail: ModelDetail): ModelDetail {
  MOCK_MODELS.push(detail);
  return detail;
}

function newModel(opts: {
  id: string;
  displayName: string;
  gameKey: TrainerGameKey;
  owner: TrainerOwnerRef;
  visibility: "public" | "private";
  elo: number;
  winRate: number;
  matchesPlayed: number;
  forkCount: number;
  hasActiveDeployment: boolean;
  hasCheckpoint: boolean;
  isStarterTemplate: boolean;
  forkedFrom?: string;
  createdDaysAgo: number;
  lastTrainedDaysAgo: number;
}): ModelDetail {
  return pushModel({
    id: opts.id,
    displayName: opts.displayName,
    gameKey: opts.gameKey,
    owner: opts.owner,
    visibility: opts.visibility,
    elo: opts.elo,
    winRate: opts.winRate,
    matchesPlayed: opts.matchesPlayed,
    forkCount: opts.forkCount,
    hasActiveDeployment: opts.hasActiveDeployment,
    hasCheckpoint: opts.hasCheckpoint,
    isStarterTemplate: opts.isStarterTemplate,
    forkedFrom: opts.forkedFrom,
    createdAt: trainerDaysAgo(opts.createdDaysAgo),
    lastTrainedAt: trainerDaysAgo(opts.lastTrainedDaysAgo),
    jobIds: [],
    deploymentIds: [],
    sourceRef: `s3://gnarena-mock/models/${opts.id}/heuristic.py`,
  });
}

// --- First 12 models owned by user0 (mixed games, visibility, fork status) ---
newModel({
  id: "mock-model-1",
  displayName: "NimNinja v3",
  gameKey: "nim",
  owner: ownerUser0,
  visibility: "public",
  elo: 1842,
  winRate: 0.68,
  matchesPlayed: 312,
  forkCount: 7,
  hasActiveDeployment: true,
  hasCheckpoint: true,
  isStarterTemplate: false,
  createdDaysAgo: 30,
  lastTrainedDaysAgo: 2,
});
newModel({
  id: "mock-model-2",
  displayName: "GuessMaster",
  gameKey: "guess",
  owner: ownerUser0,
  visibility: "public",
  elo: 1605,
  winRate: 0.55,
  matchesPlayed: 110,
  forkCount: 2,
  hasActiveDeployment: false,
  hasCheckpoint: true,
  isStarterTemplate: false,
  createdDaysAgo: 24,
  lastTrainedDaysAgo: 5,
});
newModel({
  id: "mock-model-3",
  displayName: "RedDisk Connect4",
  gameKey: "connect4",
  owner: ownerUser0,
  visibility: "private",
  elo: 1933,
  winRate: 0.72,
  matchesPlayed: 280,
  forkCount: 0,
  hasActiveDeployment: true,
  hasCheckpoint: true,
  isStarterTemplate: false,
  createdDaysAgo: 18,
  lastTrainedDaysAgo: 3,
});
newModel({
  id: "mock-model-4",
  displayName: "YellowDisk Connect4",
  gameKey: "connect4",
  owner: ownerUser0,
  visibility: "private",
  elo: 1789,
  winRate: 0.61,
  matchesPlayed: 195,
  forkCount: 0,
  hasActiveDeployment: true,
  hasCheckpoint: false,
  isStarterTemplate: false,
  createdDaysAgo: 14,
  lastTrainedDaysAgo: 4,
});
newModel({
  id: "mock-model-5",
  displayName: "DiagonalAce Connect4",
  gameKey: "connect4",
  owner: ownerUser0,
  visibility: "public",
  elo: 2014,
  winRate: 0.76,
  matchesPlayed: 410,
  forkCount: 4,
  hasActiveDeployment: true,
  hasCheckpoint: true,
  isStarterTemplate: false,
  createdDaysAgo: 12,
  lastTrainedDaysAgo: 1,
});
newModel({
  id: "mock-model-6",
  displayName: "TicTac Tactician",
  gameKey: "tictactoe",
  owner: ownerUser0,
  visibility: "public",
  elo: 1432,
  winRate: 0.51,
  matchesPlayed: 76,
  forkCount: 1,
  hasActiveDeployment: false,
  hasCheckpoint: false,
  isStarterTemplate: false,
  createdDaysAgo: 9,
  lastTrainedDaysAgo: 6,
});
newModel({
  id: "mock-model-7",
  displayName: "CheckersScout",
  gameKey: "checkers",
  owner: ownerUser0,
  visibility: "private",
  elo: 1521,
  winRate: 0.58,
  matchesPlayed: 142,
  forkCount: 0,
  hasActiveDeployment: false,
  hasCheckpoint: true,
  isStarterTemplate: false,
  createdDaysAgo: 7,
  lastTrainedDaysAgo: 2,
});
newModel({
  id: "mock-model-8",
  displayName: "NimNinja v2 (fork)",
  gameKey: "nim",
  owner: ownerUser0,
  visibility: "public",
  elo: 1701,
  winRate: 0.6,
  matchesPlayed: 88,
  forkCount: 0,
  hasActiveDeployment: false,
  hasCheckpoint: false,
  isStarterTemplate: false,
  forkedFrom: "mock-model-23",
  createdDaysAgo: 5,
  lastTrainedDaysAgo: 5,
});
newModel({
  id: "mock-model-9",
  displayName: "GuessBot Experiment",
  gameKey: "guess",
  owner: ownerUser0,
  visibility: "private",
  elo: 1208,
  winRate: 0.41,
  matchesPlayed: 30,
  forkCount: 0,
  hasActiveDeployment: false,
  hasCheckpoint: false,
  isStarterTemplate: false,
  createdDaysAgo: 4,
  lastTrainedDaysAgo: 4,
});
newModel({
  id: "mock-model-10",
  displayName: "TicTacRandom (starter)",
  gameKey: "tictactoe",
  owner: ownerUser0,
  visibility: "public",
  elo: 998,
  winRate: 0.33,
  matchesPlayed: 12,
  forkCount: 12,
  hasActiveDeployment: false,
  hasCheckpoint: false,
  isStarterTemplate: true,
  createdDaysAgo: 3,
  lastTrainedDaysAgo: 3,
});
newModel({
  id: "mock-model-11",
  displayName: "ConservativeNim",
  gameKey: "nim",
  owner: ownerUser0,
  visibility: "public",
  elo: 1322,
  winRate: 0.46,
  matchesPlayed: 50,
  forkCount: 0,
  hasActiveDeployment: false,
  hasCheckpoint: true,
  isStarterTemplate: false,
  createdDaysAgo: 2,
  lastTrainedDaysAgo: 2,
});
newModel({
  id: "mock-model-12",
  displayName: "ConservativeNim (fork of yours)",
  gameKey: "nim",
  owner: ownerUser0,
  visibility: "private",
  elo: 1190,
  winRate: 0.4,
  matchesPlayed: 6,
  forkCount: 0,
  hasActiveDeployment: false,
  hasCheckpoint: false,
  isStarterTemplate: false,
  forkedFrom: "mock-model-11",
  createdDaysAgo: 1,
  lastTrainedDaysAgo: 1,
});

// --- Remaining models owned by other users ---
const OTHER_OWNERS = [ownerUser1, ownerUser2, ownerUser3, ownerUser4, ownerUser5];
const GAMES: TrainerGameKey[] = ["nim", "guess", "checkers", "connect4", "tictactoe"];

// Ensure at least one public model per game (Top per game strip)
function topPerGame(id: string, game: TrainerGameKey, ownerRef: TrainerOwnerRef, elo: number) {
  newModel({
    id,
    displayName: `${game.toUpperCase()} Champion`,
    gameKey: game,
    owner: ownerRef,
    visibility: "public",
    elo,
    winRate: 0.78,
    matchesPlayed: 600,
    forkCount: 18,
    hasActiveDeployment: true,
    hasCheckpoint: true,
    isStarterTemplate: false,
    createdDaysAgo: 40,
    lastTrainedDaysAgo: 1,
  });
}

topPerGame("mock-model-13", "nim", ownerUser3, 2340);
topPerGame("mock-model-14", "guess", ownerUser3, 2180);
topPerGame("mock-model-15", "checkers", ownerUser2, 2055);
topPerGame("mock-model-16", "connect4", ownerUser3, 2225);
topPerGame("mock-model-17", "tictactoe", ownerUser1, 1860);

// A recently-forked model (within last 7 days, forkedFrom set)
newModel({
  id: "mock-model-18",
  displayName: "Yáo's Nim experiment",
  gameKey: "nim",
  owner: ownerUser1,
  visibility: "public",
  elo: 1620,
  winRate: 0.59,
  matchesPlayed: 75,
  forkCount: 0,
  hasActiveDeployment: false,
  hasCheckpoint: false,
  isStarterTemplate: false,
  forkedFrom: "mock-model-1",
  createdDaysAgo: 2,
  lastTrainedDaysAgo: 2,
});
newModel({
  id: "mock-model-19",
  displayName: "Drei's GuessBot",
  gameKey: "guess",
  owner: ownerUser3,
  visibility: "public",
  elo: 1735,
  winRate: 0.64,
  matchesPlayed: 120,
  forkCount: 1,
  hasActiveDeployment: false,
  hasCheckpoint: true,
  isStarterTemplate: false,
  forkedFrom: "mock-model-2",
  createdDaysAgo: 4,
  lastTrainedDaysAgo: 4,
});

// Another starter template
newModel({
  id: "mock-model-20",
  displayName: "Hello Connect4 (starter)",
  gameKey: "connect4",
  owner: ownerUser1,
  visibility: "public",
  elo: 980,
  winRate: 0.31,
  matchesPlayed: 8,
  forkCount: 5,
  hasActiveDeployment: false,
  hasCheckpoint: false,
  isStarterTemplate: true,
  createdDaysAgo: 50,
  lastTrainedDaysAgo: 50,
});

// Pad up to ~42 models with deterministic spread
function padModel(i: number) {
  const id = `mock-model-${20 + i}`;
  const owner = OTHER_OWNERS[i % OTHER_OWNERS.length];
  const game = GAMES[i % GAMES.length];
  const isPublic = i % 3 !== 0;
  const elo = 950 + ((i * 73) % 1400);
  const winRate = 0.3 + ((i * 7) % 60) / 100;
  newModel({
    id,
    displayName: `${owner.displayName.split(" ")[0]}'s ${game} bot ${i}`,
    gameKey: game,
    owner,
    visibility: isPublic ? "public" : "private",
    elo,
    winRate,
    matchesPlayed: 20 + i * 6,
    forkCount: i % 4,
    hasActiveDeployment: i % 5 === 0,
    hasCheckpoint: i % 2 === 0,
    isStarterTemplate: false,
    createdDaysAgo: 5 + i * 2,
    lastTrainedDaysAgo: 4 + i * 2,
  });
}

for (let i = 1; i <= 25; i++) padModel(i);

/* ----------------------------------------------------------------------------
 * Jobs
 * ------------------------------------------------------------------------- */

export const MOCK_JOBS: TrainingJobDetail[] = [];

function pushJob(detail: TrainingJobDetail): TrainingJobDetail {
  MOCK_JOBS.push(detail);
  // Cross-link the model -> job for the model card history.
  const model = MOCK_MODELS.find((m) => m.id === detail.modelId);
  if (model && !model.jobIds.includes(detail.id)) model.jobIds.push(detail.id);
  return detail;
}

function generateCurve(
  episodes: number,
  step: number,
  startReward: number,
  endReward: number,
  startWin: number,
  endWin: number,
): { episodesSeries: number[]; meanRewardSeries: number[]; winRateSeries: number[] } {
  const points = Math.max(2, Math.floor(episodes / step));
  const episodesSeries: number[] = [];
  const meanRewardSeries: number[] = [];
  const winRateSeries: number[] = [];
  for (let i = 0; i <= points; i++) {
    const t = i / points;
    const noise = Math.sin(i * 1.7) * 0.04;
    episodesSeries.push(Math.round(t * episodes));
    meanRewardSeries.push(+(startReward + (endReward - startReward) * t + noise).toFixed(3));
    winRateSeries.push(
      +Math.max(0, Math.min(1, startWin + (endWin - startWin) * t + noise * 0.5)).toFixed(3),
    );
  }
  return { episodesSeries, meanRewardSeries, winRateSeries };
}

function newJob(opts: {
  id: string;
  modelId: string;
  modelDisplayName: string;
  owner: TrainerOwnerRef;
  gameKey: TrainerGameKey;
  status: TrainingJobDetail["status"];
  hyperparameters: TrainingJobDetail["hyperparameters"];
  progressEpisodes: number;
  targetEpisodes: number;
  currentMeanReward: number;
  currentWinRate: number;
  createdHoursAgo: number;
  startedHoursAgo?: number;
  completedHoursAgo?: number;
  hasArtifact: boolean;
  checkpoints?: CheckpointSummary[];
  curve?: { startReward: number; endReward: number; startWin: number; endWin: number };
}): TrainingJobDetail {
  const curveOpts = opts.curve ?? {
    startReward: -0.3,
    endReward: 0.9,
    startWin: 0.2,
    endWin: 0.7,
  };
  const { episodesSeries, meanRewardSeries, winRateSeries } = generateCurve(
    opts.progressEpisodes,
    Math.max(1, Math.floor(opts.targetEpisodes / 20)),
    curveOpts.startReward,
    curveOpts.endReward,
    curveOpts.startWin,
    curveOpts.endWin,
  );
  const detail: TrainingJobDetail = {
    id: opts.id,
    modelId: opts.modelId,
    modelDisplayName: opts.modelDisplayName,
    owner: opts.owner,
    gameKey: opts.gameKey,
    status: opts.status,
    hyperparameters: opts.hyperparameters,
    progressEpisodes: opts.progressEpisodes,
    targetEpisodes: opts.targetEpisodes,
    currentMeanReward: opts.currentMeanReward,
    currentWinRate: opts.currentWinRate,
    createdAt: trainerHoursAgo(opts.createdHoursAgo),
    startedAt:
      opts.startedHoursAgo === undefined ? undefined : trainerHoursAgo(opts.startedHoursAgo),
    completedAt:
      opts.completedHoursAgo === undefined ? undefined : trainerHoursAgo(opts.completedHoursAgo),
    hasArtifact: opts.hasArtifact,
    hasCheckpoint: (opts.checkpoints?.length ?? 0) > 0,
    checkpoints: opts.checkpoints ?? [],
    episodesSeries,
    meanRewardSeries,
    winRateSeries,
    views: 0,
  };
  return pushJob(detail);
}

// --- mock-job-1: completed Nim job for user0 with downloadable .pth ---
newJob({
  id: "mock-job-1",
  modelId: "mock-model-1",
  modelDisplayName: "NimNinja v3",
  owner: ownerUser0,
  gameKey: "nim",
  status: "completed",
  hyperparameters: { episodes: 100_000, learningRate: 3e-4 },
  progressEpisodes: 100_000,
  targetEpisodes: 100_000,
  currentMeanReward: 0.91,
  currentWinRate: 0.68,
  createdHoursAgo: 50,
  startedHoursAgo: 49,
  completedHoursAgo: 47,
  hasArtifact: true,
  checkpoints: [
    {
      id: "mock-ckpt-1a",
      jobId: "mock-job-1",
      modelId: "mock-model-1",
      episodes: 50_000,
      meanReward: 0.6,
      winRate: 0.5,
      savedAt: trainerHoursAgo(48),
    },
    {
      id: "mock-ckpt-1b",
      jobId: "mock-job-1",
      modelId: "mock-model-1",
      episodes: 100_000,
      meanReward: 0.91,
      winRate: 0.68,
      savedAt: trainerHoursAgo(47),
    },
  ],
});

// --- mock-job-running: running job for user0 with checkpoint ---
newJob({
  id: "mock-job-running",
  modelId: "mock-model-3",
  modelDisplayName: "RedDisk Connect4",
  owner: ownerUser0,
  gameKey: "connect4",
  status: "running",
  hyperparameters: { episodes: 50_000, learningRate: 5e-4 },
  progressEpisodes: 20_000,
  targetEpisodes: 50_000,
  currentMeanReward: 0.42,
  currentWinRate: 0.55,
  createdHoursAgo: 2,
  startedHoursAgo: 2,
  hasArtifact: false,
  checkpoints: [
    {
      id: "mock-ckpt-running-1",
      jobId: "mock-job-running",
      modelId: "mock-model-3",
      episodes: 10_000,
      meanReward: 0.2,
      winRate: 0.4,
      savedAt: trainerHoursAgo(1.5),
    },
  ],
  curve: { startReward: -0.5, endReward: 0.5, startWin: 0.3, endWin: 0.55 },
});

// queued
newJob({
  id: "mock-job-3",
  modelId: "mock-model-5",
  modelDisplayName: "DiagonalAce Connect4",
  owner: ownerUser0,
  gameKey: "connect4",
  status: "queued",
  hyperparameters: { episodes: 200_000, learningRate: 2e-4 },
  progressEpisodes: 0,
  targetEpisodes: 200_000,
  currentMeanReward: 0,
  currentWinRate: 0,
  createdHoursAgo: 0.5,
  hasArtifact: false,
  checkpoints: [],
  curve: { startReward: 0, endReward: 0, startWin: 0, endWin: 0 },
});

// completed (older)
newJob({
  id: "mock-job-4",
  modelId: "mock-model-2",
  modelDisplayName: "GuessMaster",
  owner: ownerUser0,
  gameKey: "guess",
  status: "completed",
  hyperparameters: { episodes: 50_000, learningRate: 4e-4 },
  progressEpisodes: 50_000,
  targetEpisodes: 50_000,
  currentMeanReward: 0.7,
  currentWinRate: 0.55,
  createdHoursAgo: 120,
  startedHoursAgo: 119,
  completedHoursAgo: 117,
  hasArtifact: true,
  checkpoints: [
    {
      id: "mock-ckpt-4a",
      jobId: "mock-job-4",
      modelId: "mock-model-2",
      episodes: 50_000,
      meanReward: 0.7,
      winRate: 0.55,
      savedAt: trainerHoursAgo(117),
    },
  ],
});

// failed
newJob({
  id: "mock-job-5",
  modelId: "mock-model-9",
  modelDisplayName: "GuessBot Experiment",
  owner: ownerUser0,
  gameKey: "guess",
  status: "failed",
  hyperparameters: { episodes: 100_000, learningRate: 1e-2 },
  progressEpisodes: 8_000,
  targetEpisodes: 100_000,
  currentMeanReward: -0.4,
  currentWinRate: 0.15,
  createdHoursAgo: 72,
  startedHoursAgo: 72,
  completedHoursAgo: 71,
  hasArtifact: false,
  checkpoints: [],
  curve: { startReward: 0.0, endReward: -0.4, startWin: 0.3, endWin: 0.15 },
});

// canceled
newJob({
  id: "mock-job-6",
  modelId: "mock-model-7",
  modelDisplayName: "CheckersScout",
  owner: ownerUser0,
  gameKey: "checkers",
  status: "canceled",
  hyperparameters: { episodes: 80_000, learningRate: 3e-4 },
  progressEpisodes: 25_000,
  targetEpisodes: 80_000,
  currentMeanReward: 0.2,
  currentWinRate: 0.45,
  createdHoursAgo: 96,
  startedHoursAgo: 96,
  completedHoursAgo: 94,
  hasArtifact: false,
  checkpoints: [
    {
      id: "mock-ckpt-6a",
      jobId: "mock-job-6",
      modelId: "mock-model-7",
      episodes: 20_000,
      meanReward: 0.18,
      winRate: 0.45,
      savedAt: trainerHoursAgo(95),
    },
  ],
});

// additional completed (TicTac)
newJob({
  id: "mock-job-7",
  modelId: "mock-model-6",
  modelDisplayName: "TicTac Tactician",
  owner: ownerUser0,
  gameKey: "tictactoe",
  status: "completed",
  hyperparameters: { episodes: 30_000, learningRate: 3e-4 },
  progressEpisodes: 30_000,
  targetEpisodes: 30_000,
  currentMeanReward: 0.8,
  currentWinRate: 0.51,
  createdHoursAgo: 200,
  startedHoursAgo: 200,
  completedHoursAgo: 198,
  hasArtifact: true,
  checkpoints: [
    {
      id: "mock-ckpt-7a",
      jobId: "mock-job-7",
      modelId: "mock-model-6",
      episodes: 30_000,
      meanReward: 0.8,
      winRate: 0.51,
      savedAt: trainerHoursAgo(198),
    },
  ],
});

// additional completed (Connect4)
newJob({
  id: "mock-job-8",
  modelId: "mock-model-4",
  modelDisplayName: "YellowDisk Connect4",
  owner: ownerUser0,
  gameKey: "connect4",
  status: "completed",
  hyperparameters: { episodes: 80_000, learningRate: 3e-4 },
  progressEpisodes: 80_000,
  targetEpisodes: 80_000,
  currentMeanReward: 0.74,
  currentWinRate: 0.61,
  createdHoursAgo: 168,
  startedHoursAgo: 168,
  completedHoursAgo: 165,
  hasArtifact: true,
  checkpoints: [],
});

// extra queued for other user (not visible in user0 dashboards, but in lists)
newJob({
  id: "mock-job-9",
  modelId: "mock-model-13",
  modelDisplayName: "NIM Champion",
  owner: ownerUser3,
  gameKey: "nim",
  status: "queued",
  hyperparameters: { episodes: 1_000_000, learningRate: 1e-4 },
  progressEpisodes: 0,
  targetEpisodes: 1_000_000,
  currentMeanReward: 0,
  currentWinRate: 0,
  createdHoursAgo: 0.2,
  hasArtifact: false,
  checkpoints: [],
});

// extra running (other user)
newJob({
  id: "mock-job-10",
  modelId: "mock-model-15",
  modelDisplayName: "CHECKERS Champion",
  owner: ownerUser2,
  gameKey: "checkers",
  status: "running",
  hyperparameters: { episodes: 500_000, learningRate: 2e-4 },
  progressEpisodes: 200_000,
  targetEpisodes: 500_000,
  currentMeanReward: 0.5,
  currentWinRate: 0.6,
  createdHoursAgo: 6,
  startedHoursAgo: 6,
  hasArtifact: false,
  checkpoints: [],
});

// extra completed (other user)
newJob({
  id: "mock-job-11",
  modelId: "mock-model-17",
  modelDisplayName: "TICTACTOE Champion",
  owner: ownerUser1,
  gameKey: "tictactoe",
  status: "completed",
  hyperparameters: { episodes: 25_000, learningRate: 3e-4 },
  progressEpisodes: 25_000,
  targetEpisodes: 25_000,
  currentMeanReward: 0.95,
  currentWinRate: 0.85,
  createdHoursAgo: 300,
  startedHoursAgo: 300,
  completedHoursAgo: 298,
  hasArtifact: true,
  checkpoints: [],
});

// older user0 completed (Nim) — adds depth to model card history
newJob({
  id: "mock-job-12",
  modelId: "mock-model-1",
  modelDisplayName: "NimNinja v3",
  owner: ownerUser0,
  gameKey: "nim",
  status: "completed",
  hyperparameters: { episodes: 50_000, learningRate: 3e-4 },
  progressEpisodes: 50_000,
  targetEpisodes: 50_000,
  currentMeanReward: 0.55,
  currentWinRate: 0.55,
  createdHoursAgo: 600,
  startedHoursAgo: 600,
  completedHoursAgo: 598,
  hasArtifact: true,
  checkpoints: [],
});

// Cap-saturated Connect4 job — the live-job test routes to this id and
// asserts the Deploy button is disabled because user0 already has the
// maximum 3 active Connect4 deployments above.
newJob({
  id: "mock-job-cap-saturated",
  modelId: "mock-model-5",
  modelDisplayName: "DiagonalAce Connect4",
  owner: ownerUser0,
  gameKey: "connect4",
  status: "completed",
  hyperparameters: { episodes: 60_000, learningRate: 3e-4 },
  progressEpisodes: 60_000,
  targetEpisodes: 60_000,
  currentMeanReward: 0.78,
  currentWinRate: 0.62,
  createdHoursAgo: 36,
  startedHoursAgo: 36,
  completedHoursAgo: 34,
  hasArtifact: true,
  checkpoints: [
    {
      id: "mock-ckpt-cap-1",
      jobId: "mock-job-cap-saturated",
      modelId: "mock-model-5",
      episodes: 60_000,
      meanReward: 0.78,
      winRate: 0.62,
      savedAt: trainerHoursAgo(34),
    },
  ],
});

/* ----------------------------------------------------------------------------
 * Deployments
 * ------------------------------------------------------------------------- */

export const MOCK_DEPLOYMENTS: DeploymentDetail[] = [];

function pushDeployment(detail: DeploymentDetail): DeploymentDetail {
  MOCK_DEPLOYMENTS.push(detail);
  // Cross-link the model -> deployment for the model card.
  const model = MOCK_MODELS.find((m) => m.id === detail.modelId);
  if (model && !model.deploymentIds.includes(detail.id)) model.deploymentIds.push(detail.id);
  return detail;
}

function activitySeries(days: number, start: number): { date: string; matchesPlayed: number }[] {
  return Array.from({ length: days }, (_, i) => ({
    date: trainerDaysAgo(days - 1 - i),
    matchesPlayed: Math.max(0, Math.round(start + Math.sin(i * 1.1) * 4 + i * 1.2)),
  }));
}

function newDeployment(opts: {
  id: string;
  modelId: string;
  modelDisplayName: string;
  displayName: string;
  gameKey: TrainerGameKey;
  status: DeploymentSummary["status"];
  owner: TrainerOwnerRef;
  elo: number;
  matchesPlayed: number;
  invalidMoveStreak: number;
  lastForfeitDaysAgo?: number;
  createdDaysAgo: number;
  pausedDaysAgo?: number;
  retiredDaysAgo?: number;
  lastMatchId?: string;
  recentMatches?: DeploymentDetail["recentMatches"];
}): DeploymentDetail {
  return pushDeployment({
    id: opts.id,
    modelId: opts.modelId,
    modelDisplayName: opts.modelDisplayName,
    displayName: opts.displayName,
    gameKey: opts.gameKey,
    status: opts.status,
    owner: opts.owner,
    elo: opts.elo,
    matchesPlayed: opts.matchesPlayed,
    invalidMoveStreak: opts.invalidMoveStreak,
    invalidMoveThreshold: 3,
    lastForfeitAt:
      opts.lastForfeitDaysAgo === undefined ? undefined : trainerDaysAgo(opts.lastForfeitDaysAgo),
    lastMatchId: opts.lastMatchId,
    createdAt: trainerDaysAgo(opts.createdDaysAgo),
    pausedAt: opts.pausedDaysAgo === undefined ? undefined : trainerDaysAgo(opts.pausedDaysAgo),
    retiredAt: opts.retiredDaysAgo === undefined ? undefined : trainerDaysAgo(opts.retiredDaysAgo),
    recentMatches: opts.recentMatches ?? [],
    activitySeries: activitySeries(14, 3),
  });
}

// Connect 4: 3 active for user0 (full cap)
newDeployment({
  id: "mock-deployment-1",
  modelId: "mock-model-3",
  modelDisplayName: "RedDisk Connect4",
  displayName: "RedDisk live",
  gameKey: "connect4",
  status: "active",
  owner: ownerUser0,
  elo: 1933,
  matchesPlayed: 280,
  invalidMoveStreak: 1,
  createdDaysAgo: 12,
  lastMatchId: "mock-match-1",
});
newDeployment({
  id: "mock-deployment-2",
  modelId: "mock-model-4",
  modelDisplayName: "YellowDisk Connect4",
  displayName: "YellowDisk live",
  gameKey: "connect4",
  status: "active",
  owner: ownerUser0,
  elo: 1789,
  matchesPlayed: 195,
  invalidMoveStreak: 0,
  lastForfeitDaysAgo: 4,
  createdDaysAgo: 14,
});
newDeployment({
  id: "mock-deployment-3",
  modelId: "mock-model-5",
  modelDisplayName: "DiagonalAce Connect4",
  displayName: "DiagonalAce production",
  gameKey: "connect4",
  status: "active",
  owner: ownerUser0,
  elo: 2014,
  matchesPlayed: 410,
  invalidMoveStreak: 2,
  createdDaysAgo: 11,
});

// Paused deployment in Nim
newDeployment({
  id: "mock-deployment-4",
  modelId: "mock-model-1",
  modelDisplayName: "NimNinja v3",
  displayName: "NimNinja staging",
  gameKey: "nim",
  status: "paused",
  owner: ownerUser0,
  elo: 1842,
  matchesPlayed: 312,
  invalidMoveStreak: 0,
  createdDaysAgo: 30,
  pausedDaysAgo: 2,
});

// Retired deployment in TicTac
newDeployment({
  id: "mock-deployment-5",
  modelId: "mock-model-6",
  modelDisplayName: "TicTac Tactician",
  displayName: "TicTac old prod",
  gameKey: "tictactoe",
  status: "retired",
  owner: ownerUser0,
  elo: 1432,
  matchesPlayed: 76,
  invalidMoveStreak: 0,
  lastForfeitDaysAgo: 9,
  createdDaysAgo: 9,
  retiredDaysAgo: 1,
});

// Active deployment in Nim for user0 (so the first model has at least one active deployment)
newDeployment({
  id: "mock-deployment-6",
  modelId: "mock-model-1",
  modelDisplayName: "NimNinja v3",
  displayName: "NimNinja live",
  gameKey: "nim",
  status: "active",
  owner: ownerUser0,
  elo: 1842,
  matchesPlayed: 312,
  invalidMoveStreak: 0,
  createdDaysAgo: 28,
  lastMatchId: "mock-match-3",
});

/* ----------------------------------------------------------------------------
 * Hello world template
 * ------------------------------------------------------------------------- */

export const mockHelloWorld: { source: string; name: string } = {
  name: "Hello, GameNite!",
  source: [
    "import random",
    "",
    "def choose_move(state):",
    '    """Hello-world heuristic: pick a uniformly random legal action.',
    "",
    "    GameNite's PyTorch adapter contract: receive a state object exposing",
    "    legal_actions, return one of them. The trainer pipeline replaces this",
    "    with a learned policy after a few thousand episodes.",
    '    """',
    "    actions = list(state.legal_actions)",
    "    return random.choice(actions)",
    "",
  ].join("\n"),
};

/* ----------------------------------------------------------------------------
 * Filtering helpers
 * ------------------------------------------------------------------------- */

function dateMillis(iso: string): number {
  return new Date(iso).getTime();
}

function withinDateRange(
  iso: string,
  preset: ModelFilters["date"],
  from?: string,
  to?: string,
): boolean {
  if (preset === "all") return true;
  const t = dateMillis(iso);
  const dayMs = 24 * 60 * 60 * 1000;
  const nowT = NOW.getTime();
  switch (preset) {
    case "today":
      return nowT - t < dayMs;
    case "week":
      return nowT - t < 7 * dayMs;
    case "month":
      return nowT - t < 30 * dayMs;
    case "year":
      return nowT - t < 365 * dayMs;
    case "custom": {
      const fromT = from ? dateMillis(from) : -Infinity;
      const toT = to ? dateMillis(to) + dayMs : Infinity;
      return t >= fromT && t <= toT;
    }
  }
}

export function filterMockModels(filters: ModelFilters): {
  models: ModelSummary[];
  total: number;
} {
  const merged: ModelFilters = { ...defaultModelFilters, ...filters };
  const viewer = merged.viewerUsername;
  let list = MOCK_MODELS.filter((m) => {
    if (merged.games.length > 0 && !merged.games.includes(m.gameKey)) return false;
    if (merged.visibility !== "all" && m.visibility !== merged.visibility) return false;
    if (merged.ownership === "yours" && viewer && m.owner.username !== viewer) return false;
    if (merged.ownership === "others" && viewer && m.owner.username === viewer) return false;
    if (merged.ownership === "forked-from-yours" && viewer) {
      if (!m.forkedFrom) return false;
      const parent = MOCK_MODELS.find((mm) => mm.id === m.forkedFrom);
      if (!parent || parent.owner.username !== viewer) return false;
    }
    if (merged.deployedOnly && !m.hasActiveDeployment) return false;
    if (merged.forkedOnly && !m.forkedFrom) return false;
    if (merged.hasCheckpoint && !m.hasCheckpoint) return false;
    if (merged.tiers.length > 0) {
      const tier = tierFromRating(m.elo).tier;
      if (!merged.tiers.includes(tier)) return false;
    }
    if (m.elo < merged.minElo || m.elo > merged.maxElo) return false;
    const wrPct = m.winRate * 100;
    if (wrPct < merged.minWinRate || wrPct > merged.maxWinRate) return false;
    if (!withinDateRange(m.createdAt, merged.date, merged.dateFrom, merged.dateTo)) return false;
    if (merged.ownerSearch) {
      const q = merged.ownerSearch.toLowerCase();
      if (
        !m.owner.username.toLowerCase().includes(q) &&
        !m.owner.displayName.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  list = sortModels(list, merged.sort);
  const total = list.length;
  const start = (merged.page - 1) * merged.pageSize;
  const end = start + merged.pageSize;
  return { models: list.slice(start, end), total };
}

function sortModels<T extends ModelSummary>(list: T[], sort: ModelFilters["sort"]): T[] {
  const copy = list.slice();
  switch (sort) {
    case "newest":
      return copy.sort((a, b) => dateMillis(b.createdAt) - dateMillis(a.createdAt));
    case "oldest":
      return copy.sort((a, b) => dateMillis(a.createdAt) - dateMillis(b.createdAt));
    case "highest-elo":
      return copy.sort((a, b) => b.elo - a.elo);
    case "lowest-elo":
      return copy.sort((a, b) => a.elo - b.elo);
    case "most-forked":
      return copy.sort((a, b) => b.forkCount - a.forkCount);
    case "best-win-rate":
      return copy.sort((a, b) => b.winRate - a.winRate);
    case "worst-win-rate":
      return copy.sort((a, b) => a.winRate - b.winRate);
    case "most-matches":
      return copy.sort((a, b) => b.matchesPlayed - a.matchesPlayed);
    case "recently-trained":
      return copy.sort((a, b) => dateMillis(b.lastTrainedAt) - dateMillis(a.lastTrainedAt));
  }
}

export function filterMockJobs(filters: JobFilters): {
  jobs: TrainingJobSummary[];
  total: number;
} {
  const merged: JobFilters = { ...defaultJobFilters, ...filters };
  let list = MOCK_JOBS.filter((j) => {
    if (merged.viewerUsername && j.owner.username !== merged.viewerUsername) return false;
    if (merged.statuses.length > 0 && !merged.statuses.includes(j.status)) return false;
    if (merged.games.length > 0 && !merged.games.includes(j.gameKey)) return false;
    if (merged.hasCheckpoint && !j.hasCheckpoint) return false;
    if (!withinDateRange(j.createdAt, merged.date, merged.dateFrom, merged.dateTo)) return false;
    return true;
  });
  list = sortJobs(list, merged.sort);
  const total = list.length;
  const start = (merged.page - 1) * merged.pageSize;
  const end = start + merged.pageSize;
  return { jobs: list.slice(start, end), total };
}

function sortJobs<T extends TrainingJobSummary>(list: T[], sort: JobFilters["sort"]): T[] {
  const copy = list.slice();
  function runtimeMs(j: TrainingJobSummary): number {
    if (!j.startedAt) return 0;
    const end = j.completedAt ? dateMillis(j.completedAt) : NOW.getTime();
    return end - dateMillis(j.startedAt);
  }
  switch (sort) {
    case "newest":
      return copy.sort((a, b) => dateMillis(b.createdAt) - dateMillis(a.createdAt));
    case "oldest":
      return copy.sort((a, b) => dateMillis(a.createdAt) - dateMillis(b.createdAt));
    case "longest-running":
      return copy.sort((a, b) => runtimeMs(b) - runtimeMs(a));
    case "shortest-completed":
      return copy
        .filter((j) => j.status === "completed")
        .sort((a, b) => runtimeMs(a) - runtimeMs(b))
        .concat(copy.filter((j) => j.status !== "completed"));
    case "highest-reward":
      return copy.sort((a, b) => b.currentMeanReward - a.currentMeanReward);
    case "lowest-reward":
      return copy.sort((a, b) => a.currentMeanReward - b.currentMeanReward);
  }
}

export function filterMockDeployments(filters: DeploymentFilters): {
  deployments: DeploymentSummary[];
  total: number;
} {
  const merged: DeploymentFilters = { ...defaultDeploymentFilters, ...filters };
  let list = MOCK_DEPLOYMENTS.filter((d) => {
    if (merged.viewerUsername && d.owner.username !== merged.viewerUsername) return false;
    if (merged.statuses.length > 0 && !merged.statuses.includes(d.status)) return false;
    if (merged.games.length > 0 && !merged.games.includes(d.gameKey)) return false;
    if (merged.recentForfeits) {
      if (!d.lastForfeitAt) return false;
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (NOW.getTime() - dateMillis(d.lastForfeitAt) > sevenDays) return false;
    }
    return true;
  });
  list = sortDeployments(list, merged.sort);
  const total = list.length;
  const start = (merged.page - 1) * merged.pageSize;
  const end = start + merged.pageSize;
  return { deployments: list.slice(start, end), total };
}

function sortDeployments<T extends DeploymentSummary>(
  list: T[],
  sort: DeploymentFilters["sort"],
): T[] {
  const copy = list.slice();
  switch (sort) {
    case "newest":
      return copy.sort((a, b) => dateMillis(b.createdAt) - dateMillis(a.createdAt));
    case "oldest":
      return copy.sort((a, b) => dateMillis(a.createdAt) - dateMillis(b.createdAt));
    case "most-matches":
      return copy.sort((a, b) => b.matchesPlayed - a.matchesPlayed);
    case "highest-elo":
      return copy.sort((a, b) => b.elo - a.elo);
    case "recent-forfeits":
      return copy.sort(
        (a, b) =>
          (b.lastForfeitAt ? dateMillis(b.lastForfeitAt) : 0) -
          (a.lastForfeitAt ? dateMillis(a.lastForfeitAt) : 0),
      );
  }
}

/* ----------------------------------------------------------------------------
 * Per-game active deployment counter (Story 2.7 cap)
 * ------------------------------------------------------------------------- */

export function countActiveDeploymentsForGame(userId: string, gameKey: TrainerGameKey): number {
  return MOCK_DEPLOYMENTS.filter(
    (d) => d.owner.username === userId && d.gameKey === gameKey && d.status === "active",
  ).length;
}

/** Throws DeploymentCapExceededError if the cap is hit. */
export function assertCapAvailable(userId: string, gameKey: TrainerGameKey): void {
  const used = countActiveDeploymentsForGame(userId, gameKey);
  if (used >= DEPLOYMENT_CAP_PER_GAME) {
    throw new DeploymentCapExceededError(gameKey, DEPLOYMENT_CAP_PER_GAME, used);
  }
}

/* ----------------------------------------------------------------------------
 * Featured strip resolution (top-per-game / recently-forked / starters)
 * ------------------------------------------------------------------------- */

export function topModelPerGame(): ModelSummary[] {
  const out: ModelSummary[] = [];
  for (const g of GAMES) {
    const best = MOCK_MODELS.filter((m) => m.gameKey === g && m.visibility === "public").sort(
      (a, b) => b.elo - a.elo,
    )[0];
    if (best) out.push(best);
  }
  return out;
}

export function recentlyForkedModels(): ModelSummary[] {
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  return MOCK_MODELS.filter(
    (m) => Boolean(m.forkedFrom) && NOW.getTime() - dateMillis(m.createdAt) < sevenDays,
  ).slice(0, 12);
}

export function starterTemplateModels(): ModelSummary[] {
  return MOCK_MODELS.filter((m) => m.isStarterTemplate);
}

/* ----------------------------------------------------------------------------
 * Find / mutate helpers
 * ------------------------------------------------------------------------- */

export function findMockModel(modelId: string): ModelDetail | undefined {
  return MOCK_MODELS.find((m) => m.id === modelId);
}

export function findMockJob(jobId: string): TrainingJobDetail | undefined {
  return MOCK_JOBS.find((j) => j.id === jobId);
}

export function findMockDeployment(deploymentId: string): DeploymentDetail | undefined {
  return MOCK_DEPLOYMENTS.find((d) => d.id === deploymentId);
}

/** Increments mock view counter (Story: live counter for live view page). */
export function incrementJobViews(jobId: string): number {
  const job = findMockJob(jobId);
  if (!job) return 0;
  job.views += 1;
  return job.views;
}

/** Used by deploymentService.updateDeploymentStatus mock. */
export function setDeploymentStatus(
  deploymentId: string,
  status: DeploymentSummary["status"],
): DeploymentDetail | undefined {
  const d = findMockDeployment(deploymentId);
  if (!d) return undefined;
  d.status = status;
  if (status === "paused") d.pausedAt = trainerDaysAgo(0);
  if (status === "retired") d.retiredAt = trainerDaysAgo(0);
  if (status === "active") {
    d.pausedAt = undefined;
    d.retiredAt = undefined;
  }
  return d;
}

/** Sets a job's status (used by cancelJob mock). */
export function setJobStatus(
  jobId: string,
  status: TrainingJobDetail["status"],
): TrainingJobDetail | undefined {
  const j = findMockJob(jobId);
  if (!j) return undefined;
  j.status = status;
  if (status === "canceled" || status === "completed" || status === "failed") {
    j.completedAt = trainerHoursAgo(0);
  }
  return j;
}

/* ----------------------------------------------------------------------------
 * Mock WebSocket subscriber (live progress)
 * ------------------------------------------------------------------------- */

const EMIT_INTERVAL_MS = 400;
const TOTAL_PROGRESS_EVENTS = 12;
const PROGRESS_EPISODE_STEP = 1_000;

export function subscribeMockProgress(
  jobId: string,
  cb: (event: TrainingStreamEvent) => void,
): () => void {
  const job = findMockJob(jobId);
  let cancelled = false;
  let interval: ReturnType<typeof setInterval> | null = null;
  if (!job) {
    return () => {
      cancelled = true;
    };
  }
  let count = 0;
  let epoch = job.progressEpisodes;
  const baseLoss = 1.2;

  // Lifecycle: started → progress*N → complete. Matches the real backend WS
  // contract so a consumer breakage shows up here, not at integration time.
  cb({
    kind: "started",
    jobId,
    progress: 0,
    epoch,
    metrics: { loss: baseLoss, meanReward: 0.2, winRate: 0.3 },
    message: "Training run starting",
    timestamp: new Date().toISOString(),
  });

  function emit() {
    if (cancelled) return;
    count += 1;
    const t = count / TOTAL_PROGRESS_EVENTS;
    const noise = Math.sin(count * 1.9) * 0.04;
    const meanReward = +Math.max(0, Math.min(1, 0.2 + 0.7 * t + noise)).toFixed(3);
    const winRate = +Math.max(0, Math.min(1, 0.3 + 0.4 * t + noise * 0.5)).toFixed(3);
    const loss = +Math.max(0.01, baseLoss * (1 - 0.85 * t) + Math.abs(noise)).toFixed(3);
    epoch += PROGRESS_EPISODE_STEP;
    if (count >= TOTAL_PROGRESS_EVENTS) {
      cb({
        kind: "complete",
        jobId,
        progress: 1,
        epoch,
        metrics: { loss, meanReward: 0.92, winRate: 0.7 },
        message: "Training complete",
        timestamp: new Date().toISOString(),
      });
      if (interval) clearInterval(interval);
      return;
    }
    cb({
      kind: "progress",
      jobId,
      progress: t,
      epoch,
      metrics: { loss, meanReward, winRate },
      message: `Epoch ${epoch.toLocaleString()} — reward ${meanReward.toFixed(2)}`,
      timestamp: new Date().toISOString(),
    });
  }

  interval = setInterval(emit, EMIT_INTERVAL_MS);
  return () => {
    cancelled = true;
    if (interval) clearInterval(interval);
  };
}

/* ----------------------------------------------------------------------------
 * Diagnostic exports
 * ------------------------------------------------------------------------- */

export function trainerFixtureSize(): { models: number; jobs: number; deployments: number } {
  return {
    models: MOCK_MODELS.length,
    jobs: MOCK_JOBS.length,
    deployments: MOCK_DEPLOYMENTS.length,
  };
}
