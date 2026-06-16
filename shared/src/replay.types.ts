/**
 * Wire format for the replay viewer surfaces.
 *
 * Distinct from `MatchRecord` in server/src/models.ts: that one is the raw
 * archival shape written by the MatchRecorder; this one is the projection
 * served over `/api/replay/...` and consumed by the discovery / viewer pages.
 *
 * Server-side `replay.service.ts` maps `MatchRecord -> ReplayDetail`.
 */

// Must stay in sync with client/src/util/types.ts ALL_GAME_KEYS.
export type ReplayGameKey = "tictactoe" | "connect4" | "checkers" | "nim" | "guess";

export type ReplayMatchOutcome = "win" | "draw" | "abandoned" | "forfeit";

export interface MatchParticipantView {
  id: string;
  type: "human" | "ai";
  displayName: string;
  username?: string;
  ratingAtMatchTime?: number;
}

export interface MatchMoveView {
  index: number;
  actor: string;
  actorDisplayName: string;
  move: unknown;
  notation: string;
  /** ISO timestamp. */
  timestamp: string;
}

export interface MatchResultView {
  winnerId?: string;
  outcome: ReplayMatchOutcome;
  ratingChanges?: { entityId: string; delta: number }[];
}

export interface ReplaySummary {
  matchId: string;
  gameKey: ReplayGameKey;
  rated: boolean;
  participants: MatchParticipantView[];
  result: MatchResultView;
  moveCount: number;
  watchCount: number;
  /** ISO timestamp the match was finalized. */
  completedAt: string;
}

export interface ReplayDetail extends ReplaySummary {
  gameId: string;
  moves: MatchMoveView[];
  initialState?: unknown;
}

export type ReplaySort =
  | "newest"
  | "oldest"
  | "most-viewed"
  | "fewest-viewed"
  | "longest"
  | "shortest"
  | "highest-elo"
  | "lowest-elo";

export type ParticipantTypeFilter = "all" | "humans" | "ais" | "mixed";
export type DateRangePreset = "all" | "today" | "week" | "month" | "year" | "custom";
export type ResultFilter = "wins" | "losses" | "draws" | "abandoned" | "forfeit";

/**
 * Filters accepted on the `/api/replay/list` query string. All fields are
 * optional on the wire; the server applies sensible defaults.
 */
export interface ReplayListQuery {
  sort?: ReplaySort;
  games?: ReplayGameKey[];
  participantType?: ParticipantTypeFilter;
  results?: ResultFilter[];
  minElo?: number;
  maxElo?: number;
  date?: DateRangePreset;
  dateFrom?: string;
  dateTo?: string;
  minMoves?: number;
  maxMoves?: number;
  participantSearch?: string;
  ratedOnly?: boolean;
  preset?: "upsets";
  page?: number;
  pageSize?: number;
  forUser?: string;
}

export interface ReplayListPage {
  replays: ReplaySummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReplayWatchCountResponse {
  matchId: string;
  watchCount: number;
}

/**
 * Socket broadcast sent to everyone in a replay's presence room whenever a
 * viewer joins or leaves. `count` is the live socket-room size — real
 * presence, not an estimate.
 */
export interface ReplayWatchersPayload {
  matchId: string;
  count: number;
}

/**
 * Per-move server-side engine evaluation (#63). Unlike `AnnotationMarker`
 * (user-authored), `flag` is computed by comparing the actual move to the
 * engine's preferred move at that position.
 */
export interface AnalysisMoveResult {
  moveIndex: number;
  flag: "best" | "blunder" | "inaccuracy" | "neutral";
  confidence: number;
  notes?: string;
  /** What the engine would have played instead, if different from actual. */
  suggestedMove?: unknown;
  /** What a loaded inference model played here, if a deploymentId was supplied. */
  engineMove?: unknown;
}

export interface AnalysisResult {
  matchId: string;
  generatedAt: string;
  perMove: AnalysisMoveResult[];
  /**
   * Set when a deploymentId was supplied but the model could not be run
   * (inference unreachable, model not loadable, unsupported game) — so the
   * client can say the AI insight failed instead of silently showing nothing.
   */
  aiError?: string;
}
