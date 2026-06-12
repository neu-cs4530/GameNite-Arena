import type {
  ClientToServerEvents,
  GameKey,
  MessageInfo,
  SafeUserInfo,
  ServerToClientEvents,
  TrainingProgressEvent,
} from "@gamenite/shared";
import type { Socket } from "socket.io-client";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * In addition to messages, chats can include socket-introduced messages
 * that a user entered or left the chat.
 */
export type ChatMessage =
  | MessageInfo
  | { messageId: string; meta: "entered"; dateTime: Date; user: SafeUserInfo }
  | { messageId: string; meta: "left"; dateTime: Date; user: SafeUserInfo };

export interface GameProps<View, Move> {
  userPlayerIndex: number;
  players: SafeUserInfo[];
  view: View;
  makeMove: (move: Move) => void;
}

/* ============================================================================
 * Replay / profile types (frontend mirror of upcoming server types)
 * Once the server moves its match types into @gamenite/shared, swap these
 * client-local imports for shared ones.
 * ============================================================================ */

/**
 * Every supported game has a string key. This is the canonical client-side
 * list and includes upcoming/unimplemented games so filters render even
 * when no live match exists. The shared `GameKey` is a subset of these.
 */
export const ALL_GAME_KEYS = ["nim", "guess", "checkers", "connect4", "tictactoe"] as const;
export type ReplayGameKey = (typeof ALL_GAME_KEYS)[number];

/** What we know about a single participant of a recorded match. */
export interface MatchParticipantView {
  id: string;
  type: "human" | "ai";
  displayName: string;
  username?: string;
  /** Snapshot of the entity's Glicko 2 rating at the time the match completed. */
  ratingAtMatchTime?: number;
}

/** A recorded move within a match. */
export interface MatchMoveView {
  /** Index in the move list (0-based). */
  index: number;
  /** Which participant id played this move. */
  actor: string;
  /** Display name resolved at the time the match completed (for fast rendering). */
  actorDisplayName: string;
  /** The actual move (per-game shape). */
  move: unknown;
  /** Short human-readable summary used by `<MoveList>`. */
  notation: string;
  /** ISO timestamp of when this move was played. */
  timestamp: string;
}

export type MatchOutcome = "win" | "draw" | "abandoned" | "forfeit";

export interface MatchResultView {
  winnerId?: string;
  outcome: MatchOutcome;
  ratingChanges?: { entityId: string; delta: number }[];
}

/** Summary shape used by `<MatchCard>` in lists and discovery feeds. */
export interface ReplaySummary {
  matchId: string;
  gameKey: ReplayGameKey;
  rated: boolean;
  participants: MatchParticipantView[];
  result: MatchResultView;
  /** Total number of moves played. */
  moveCount: number;
  /** How many times the replay viewer has been opened for this match. */
  watchCount: number;
  completedAt: string;
}

/** Full replay (used by the replay viewer). Extends `ReplaySummary` with moves. */
export interface ReplayDetail extends ReplaySummary {
  gameId: string;
  moves: MatchMoveView[];
  /** Optional opaque initial state to seed the per-game reducer. */
  initialState?: unknown;
}

export interface ReplayListPage {
  replays: ReplaySummary[];
  total: number;
  page: number;
  pageSize: number;
}

/* --- Filters ---------------------------------------------------------- */

export type ReplaySort =
  | "newest"
  | "oldest"
  | "most-viewed"
  | "fewest-viewed"
  | "longest"
  | "shortest"
  | "highest-elo"
  | "lowest-elo";

export type ParticipantType = "all" | "humans" | "ais" | "mixed";
export type DateRangePreset = "all" | "today" | "week" | "month" | "year" | "custom";
export type ResultFilter = "wins" | "losses" | "draws" | "abandoned" | "forfeit";

export interface ReplayFilters {
  sort: ReplaySort;
  /** Empty array = no game-key restriction. */
  games: ReplayGameKey[];
  participantType: ParticipantType;
  /** Empty array = no result restriction. */
  results: ResultFilter[];
  minElo: number;
  maxElo: number;
  date: DateRangePreset;
  dateFrom?: string;
  dateTo?: string;
  minMoves: number;
  maxMoves: number;
  participantSearch: string;
  ratedOnly: boolean;
  /** Optional preset selection — applied on top of all other filters. */
  preset?: "upsets";
  /** Pagination: how many items per page. */
  page: number;
  pageSize: number;
  /** If supplied, list will be filtered to replays involving this username. */
  forUser?: string;
}

/**
 * Default filter state for the replay discovery feed. The `sort` + `date`
 * pair is the expansion of the default "Popular this week" preset (see
 * `components/filters/replayPresets.ts`), so a pristine `/replays` URL and
 * "Clear all" both land on that preset. User-scoped lists (e.g. the profile
 * page) keep a neutral newest/all-time baseline by NOT passing `defaults`
 * to `useReplayFilters` — they are unaffected by these two values.
 */
export const defaultReplayFilters: ReplayFilters = {
  sort: "most-viewed",
  games: [],
  participantType: "all",
  results: [],
  minElo: 800,
  maxElo: 2400,
  date: "week",
  minMoves: 1,
  maxMoves: 200,
  participantSearch: "",
  ratedOnly: false,
  page: 1,
  pageSize: 24,
};

/* --- Annotations ------------------------------------------------------ */

export type AnnotationMarker = "good" | "interesting" | "questionable" | "bad" | "winning";

export interface AnnotationView {
  id: string;
  matchId: string;
  moveIndex: number;
  text: string;
  marker?: AnnotationMarker;
  authorId: string;
  authorDisplayName: string;
  /** Username for navigating to the author's profile (`/profile/:username`). */
  authorUsername?: string;
  visibility: "private" | "shared";
  shareToken?: string;
  createdAt: string;
  editedAt?: string;
  /** Mocked reactions store. */
  reactions: { thumbsUp: number; thumbsDown: number };
}

export interface CreateAnnotationPayload {
  moveIndex: number;
  text: string;
  marker?: AnnotationMarker;
}

export interface UpdateAnnotationPayload {
  text?: string;
  marker?: AnnotationMarker | null;
  visibility?: "private" | "shared";
}

/* --- Analysis -------------------------------------------------------- */

export interface AnalysisMoveResult {
  moveIndex: number;
  flag: "best" | "blunder" | "inaccuracy" | "neutral";
  confidence: number;
  notes?: string;
  /** What the engine would have played instead, if different from actual. */
  suggestedMove?: unknown;
}

export interface AnalysisResult {
  matchId: string;
  generatedAt: string;
  perMove: AnalysisMoveResult[];
}

/* --- Profile -------------------------------------------------------- */

export interface ProfileGameStats {
  gameKey: ReplayGameKey;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface ProfileDetail {
  user: SafeUserInfo;
  joinedAt: string;
  overallElo: number;
  totalMatches: number;
  wins: number;
  losses: number;
  draws: number;
  currentStreak: number;
  perGame: ProfileGameStats[];
  /** True if the requested profile exists and is loaded. */
  exists: boolean;
}

export type ReplayGameKeyOrAll = ReplayGameKey | "all";

/** Re-export for convenience: `GameKey` is the shared subset of `ReplayGameKey`. */
export type SharedGameKey = GameKey;

/* --- Leaderboards ------------------------------------------------------ */

/** One ranked row from GET /api/leaderboard/:gameKey (client mirror). */
export interface LeaderboardEntry {
  rank: number;
  entityId: string;
  entityType: "human" | "ai";
  displayName: string;
  /** Present for humans only — links to /profile/:username. */
  username?: string;
  rating: number;
  rd: number;
  gamesPlayed: number;
  provisional: boolean;
  /** Rated wins in this game. */
  wins: number;
  /** wins / gamesPlayed as a 0..1 fraction; 0 when no games played. */
  winRate: number;
}

/** Paginated leaderboard response (client mirror). */
export interface LeaderboardPage {
  gameKey: GameKey;
  entityType: "human" | "ai" | "all";
  page: number;
  limit: number;
  total: number;
  entries: LeaderboardEntry[];
}

/** Sort keys offered on the leaderboards tab. "rating" is the server order. */
export type LeaderboardSort = "rating" | "winRate" | "wins" | "gamesPlayed";

/** Entity-type filter — maps straight onto the API's `type` param. */
export type LeaderboardEntityFilter = "all" | "human" | "ai";

/* ============================================================================
 * Trainer types (Models, Training Jobs, Deployments)
 * Mirrors upcoming server types; once the server lands these, swap to shared.
 * ============================================================================ */

/** Trainer-supported games are the same set as replay-supported games. */
export type TrainerGameKey = ReplayGameKey;

/** Training mode is derived from the game: adversarial -> self-play, single-player -> environment-driven. */
export type TrainingMode = "self-play" | "environment-driven";

/** Visibility of a trained model. */
export type ModelVisibility = "public" | "private";

/** Lifecycle state of a deployment. */
export type DeploymentStatus = "active" | "paused" | "retired";

/** Lifecycle state of a training job. */
export type JobStatus = "queued" | "running" | "completed" | "failed" | "canceled";

/** Per-game Elo entry on a model card. */
export interface ModelEloEntry {
  gameKey: TrainerGameKey;
  elo: number;
}

/** A saved checkpoint from a training job. */
export interface CheckpointSummary {
  id: string;
  jobId: string;
  modelId: string;
  episodes: number;
  meanReward: number;
  winRate: number;
  savedAt: string;
}

/** Owner reference used in trainer fixtures (lightweight subset of SafeUserInfo). */
export interface TrainerOwnerRef {
  username: string;
  displayName: string;
}

/** Hyperparameters used for a training run. */
export interface TrainingHyperparameters {
  episodes: number;
  learningRate: number;
  /** Optional opaque extra config blob (JSON-serializable). */
  extraConfig?: Record<string, unknown>;
}

/** Cost estimator output. */
export interface TrainingCostEstimate {
  estimatedMinutes: number;
  estimatedCreditsPerHour: number;
  totalCredits: number;
  /** Whether the user has enough credits to run this job. */
  withinBudget: boolean;
}

/** Hyperparameter preset name. */
export type HyperparamPreset = "aggressive" | "balanced" | "conservative";

/** Model card stats (Story 2.11). */
export interface ModelCardStats {
  modelId: string;
  winRate: number;
  averageMoveLatencyMs: number;
  perGameElo: ModelEloEntry[];
  totalMatchesPlayed: number;
  daysSinceLastTraining: number;
}

/** Model summary used in list views. */
export interface ModelSummary {
  id: string;
  displayName: string;
  gameKey: TrainerGameKey;
  owner: TrainerOwnerRef;
  visibility: ModelVisibility;
  elo: number;
  winRate: number;
  matchesPlayed: number;
  forkCount: number;
  /** True if at least one active deployment references this model. */
  hasActiveDeployment: boolean;
  /** True if at least one saved checkpoint exists. */
  hasCheckpoint: boolean;
  /** True if this is a starter template (Story 2.12). */
  isStarterTemplate: boolean;
  /** Model id of the parent if this is a fork (Story 2.13). */
  forkedFrom?: string;
  /** ISO timestamps. */
  createdAt: string;
  lastTrainedAt: string;
}

/** Full model detail. */
export interface ModelDetail extends ModelSummary {
  /** Cumulative training jobs for this model. */
  jobIds: string[];
  /** Cumulative deployment ids for this model. */
  deploymentIds: string[];
  /** Mock source ref pointing at object storage. */
  sourceRef: string;
}

export interface ModelListPage {
  models: ModelSummary[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Live-progress contract — PR #64 landed on main, so the canonical
 * declarations now come from `shared/src/trainingProgress.types.ts` and are
 * re-exported here so existing consumer imports keep working.
 *
 * Field-naming note: live events use `epoch`; the persisted job record
 * uses `episodes` for the equivalent counter.
 */
export type { TrainingProgressEvent, TrainingStatus } from "@gamenite/shared";

/** Backwards-compat alias for the union name we used before the realignment. */
export type TrainingStreamEvent = TrainingProgressEvent;

/** Training job summary used in list views. */
export interface TrainingJobSummary {
  id: string;
  modelId: string;
  modelDisplayName: string;
  owner: TrainerOwnerRef;
  gameKey: TrainerGameKey;
  status: JobStatus;
  hyperparameters: TrainingHyperparameters;
  /** Episodes completed so far. */
  progressEpisodes: number;
  /** Total target episodes. */
  targetEpisodes: number;
  /** Most recent mean reward; 0 until first event. */
  currentMeanReward: number;
  /** Most recent win rate; 0 until first event. */
  currentWinRate: number;
  /** ISO timestamps. */
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  /** True if .pth artifact is downloadable (status === completed). */
  hasArtifact: boolean;
  /** Integrity metadata recorded when the artifact was stored (real runs). */
  artifactMeta?: { bytes: number; sha256: string; uploadedAt: string };
  /** Failure reason reported by the trainer (status === failed). */
  error?: string;
  /** True if at least one checkpoint exists. */
  hasCheckpoint: boolean;
  /** Optional notify-on-complete flag mirrored from localStorage. */
  notifyOnComplete?: boolean;
}

/** Full training job detail (includes checkpoints and curve series). */
export interface TrainingJobDetail extends TrainingJobSummary {
  checkpoints: CheckpointSummary[];
  /** Episode marker array for the chart. */
  episodesSeries: number[];
  /** Mean reward series. */
  meanRewardSeries: number[];
  /** Win-rate series. */
  winRateSeries: number[];
  /** Cumulative view count for the live page (see "watch-count style"). */
  views: number;
}

export interface JobListPage {
  jobs: TrainingJobSummary[];
  total: number;
  page: number;
  pageSize: number;
}

/** Recent match summary surfaced on a deployment card. */
export interface DeploymentRecentMatch {
  matchId: string;
  outcome: MatchOutcome;
  completedAt: string;
}

/** Per-day activity sample (deployment sparkline). */
export interface DeploymentActivitySample {
  date: string;
  matchesPlayed: number;
}

export interface DeploymentSummary {
  id: string;
  modelId: string;
  modelDisplayName: string;
  displayName: string;
  gameKey: TrainerGameKey;
  status: DeploymentStatus;
  owner: TrainerOwnerRef;
  /** Snapshot Elo of the deployed model. */
  elo: number;
  matchesPlayed: number;
  /** Sliding counter of consecutive invalid moves (Story 2.8). */
  invalidMoveStreak: number;
  /** Threshold at which the deployment forfeits. */
  invalidMoveThreshold: number;
  /** Optional timestamp of the last forfeit. */
  lastForfeitAt?: string;
  /** Optional timestamp of the most recent match played (cross-link to replay). */
  lastMatchId?: string;
  createdAt: string;
  pausedAt?: string;
  retiredAt?: string;
}

export interface DeploymentDetail extends DeploymentSummary {
  recentMatches: DeploymentRecentMatch[];
  activitySeries: DeploymentActivitySample[];
}

export interface DeploymentListPage {
  deployments: DeploymentSummary[];
  total: number;
  page: number;
  pageSize: number;
}

/* --- Trainer Filters -------------------------------------------------- */

export type ModelSort =
  | "newest"
  | "oldest"
  | "highest-elo"
  | "lowest-elo"
  | "most-forked"
  | "best-win-rate"
  | "worst-win-rate"
  | "most-matches"
  | "recently-trained";

export type ModelVisibilityFilter = "all" | "public" | "private";
export type ModelOwnershipFilter = "all" | "yours" | "others" | "forked-from-yours";
export type TrainerTier = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export interface ModelFilters {
  sort: ModelSort;
  games: TrainerGameKey[];
  visibility: ModelVisibilityFilter;
  ownership: ModelOwnershipFilter;
  deployedOnly: boolean;
  forkedOnly: boolean;
  tiers: TrainerTier[];
  minElo: number;
  maxElo: number;
  minWinRate: number;
  maxWinRate: number;
  date: DateRangePreset;
  dateFrom?: string;
  dateTo?: string;
  ownerSearch: string;
  hasCheckpoint: boolean;
  page: number;
  pageSize: number;
  /** Viewing-user username (for "yours" / "forked-from-yours" filters). */
  viewerUsername?: string;
}

export const defaultModelFilters: ModelFilters = {
  sort: "newest",
  games: [],
  visibility: "all",
  ownership: "all",
  deployedOnly: false,
  forkedOnly: false,
  tiers: [],
  minElo: 800,
  maxElo: 2400,
  minWinRate: 0,
  maxWinRate: 100,
  date: "all",
  ownerSearch: "",
  hasCheckpoint: false,
  page: 1,
  pageSize: 24,
};

export type JobSort =
  | "newest"
  | "oldest"
  | "longest-running"
  | "shortest-completed"
  | "highest-reward"
  | "lowest-reward";

export interface JobFilters {
  sort: JobSort;
  statuses: JobStatus[];
  games: TrainerGameKey[];
  hasCheckpoint: boolean;
  date: DateRangePreset;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
  viewerUsername?: string;
}

export const defaultJobFilters: JobFilters = {
  sort: "newest",
  statuses: [],
  games: [],
  hasCheckpoint: false,
  date: "all",
  page: 1,
  pageSize: 12,
};

export type DeploymentSort =
  | "newest"
  | "oldest"
  | "most-matches"
  | "highest-elo"
  | "recent-forfeits";

export interface DeploymentFilters {
  sort: DeploymentSort;
  statuses: DeploymentStatus[];
  games: TrainerGameKey[];
  recentForfeits: boolean;
  page: number;
  pageSize: number;
  viewerUsername?: string;
}

export const defaultDeploymentFilters: DeploymentFilters = {
  sort: "newest",
  statuses: [],
  games: [],
  recentForfeits: false,
  page: 1,
  pageSize: 24,
};

/** Featured strip names for `ModelsBrowse`. */
export type ModelFeaturedStrip = "top-per-game" | "recently-forked" | "starter-templates";

/** Payload passed to `submitJob`. */
export interface SubmitJobPayload {
  modelId?: string;
  /** Optional checkpoint id to resume from (Story 2.10). */
  checkpointId?: string;
  gameKey: TrainerGameKey;
  modelDisplayName: string;
  hyperparameters: TrainingHyperparameters;
  /** Whether to notify the user when training completes. */
  notifyOnComplete?: boolean;
}

/** Payload passed to `uploadHeuristic`. */
export interface UploadHeuristicPayload {
  displayName: string;
  gameKey: TrainerGameKey;
  visibility: ModelVisibility;
}

/** Payload passed to `createDeployment`. */
export interface CreateDeploymentPayload {
  displayName: string;
}

/** Payload passed to `forkModel`. */
export interface ForkModelPayload {
  displayName: string;
  visibility: ModelVisibility;
}

/** Error thrown when a deployment hits the per-game cap (Story 2.7). */
export class DeploymentCapExceededError extends Error {
  public readonly gameKey: TrainerGameKey;
  public readonly cap: number;
  public readonly used: number;
  constructor(gameKey: TrainerGameKey, cap: number, used: number) {
    const label = replayGameNamesLazy(gameKey);
    super(
      `You already have ${used} active deployments in ${label}. ` +
        `Pause or retire one to free a slot.`,
    );
    this.name = "DeploymentCapExceededError";
    this.gameKey = gameKey;
    this.cap = cap;
    this.used = used;
  }
}

/**
 * Lazily resolves a game key to its display name without circular-importing
 * the consts file from types. Mirrors `replayGameNames`.
 */
function replayGameNamesLazy(gameKey: TrainerGameKey): string {
  switch (gameKey) {
    case "nim":
      return "Nim";
    case "guess":
      return "Number Guesser";
    case "checkers":
      return "Checkers";
    case "connect4":
      return "Connect 4";
    case "tictactoe":
      return "Tic-Tac-Toe";
  }
}
