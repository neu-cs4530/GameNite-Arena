import type { GameKey } from "@gamenite/shared";

/**
 * Record identifiers used to look up records in a database. This type
 * abbreviation is intended to suggest that the key should be a randomly
 * generated unique ID.
 */
export type RecordId = string;

/**
 * Actual JavaScript Date objects can't stored in a database that only accepts
 * JSON objects; this type indicates that the string should be the result of
 * taking a Date object and turning it to a string with the Date.toISOString()
 * method.
 */
export type DateISO = string;

/* ============================================================================
 * Existing records (extended for GameNite Arena)
 * See db/SCHEMA.md for the field-by-field changelog.
 * ============================================================================ */

/**
 * Represents a user's authorization record in the database.
 * - `userId`: the user ID of the corresponding User model
 * - `password`: the password for this user
 */
export interface AuthRecord {
  userId: RecordId; // References User records
  password: string;
}

/**
 * Represents a chat document in the database.
 * - `messages`: the ordered list of messages in the chat
 * - `createdAt`: when the chat was created
 */
export interface ChatRecord {
  messages: RecordId[]; // References Message records
  createdAt: DateISO;
}

/**
 * Represents a comment in the database.
 * - `text`: comment contents
 * - `createdBy`: user id of the commenter
 * - `createdAt`: when the comment was made
 * - `editedAt`: when the comment was last modified
 */
export interface CommentRecord {
  text: string;
  createdBy: RecordId; // References User records
  createdAt: DateISO;
  editedAt?: DateISO;
}

/**
 * Represents a game document in the database.
 * - `type`: picks which game this is
 * - `state`: absent if the game hasn't started, or the id for the game's state
 * - `done`: whether the game has finished
 * - `chat`: id for the game's chat
 * - `players`: seat ids for the game, in seat order: user ids for human
 *              seats, deployment ids for AI seats (Story 1, 3, 2.6)
 * - `aiPlayers`: deployed AI participants in the game, POSITIONAL with
 *               `players` — `aiPlayers[i]` describes the AI in seat i, and is
 *               null/absent for human seats (Story 2.6)
 * - `rated`: whether this game contributes to Glicko 2 ratings (Story 1.2)
 * - `delaySec`: broadcaster-configured live broadcast delay in seconds (Story 3.7)
 * - `invalidMoveStreaks`: per-seat (keyed by seat index) count of an AI's
 *               consecutive invalid moves, mirrored from the inference
 *               service's 422 counter; the AI forfeits at 3 (Story 2.8)
 * - `matchId`: set when game completes and a MatchRecord is created (Story 3.1)
 * - `createdAt`: when the game was created
 * - `createdBy`: user id of the person who created the game
 */
export interface GameRecord {
  type: GameKey;
  state?: unknown;
  done: boolean;
  chat: RecordId; // References Chat records
  players: RecordId[]; // References User records
  aiPlayers: (AIParticipant | null)[]; // References Deployment records (Story 2.6)
  rated: boolean; // Story 1.2
  delaySec?: number; // Story 3.7
  invalidMoveStreaks?: { [seatIndex: string]: number }; // Story 2.8
  matchId?: RecordId; // References Match records, set on completion (Story 3.1)
  createdAt: DateISO;
  createdBy: RecordId; // References User records
}

/**
 * Represents an AI participant in a game.
 * - `deploymentId`: the deployment the AI move requests will be routed to
 * - `modelId`: the underlying trained model
 * - `displayName`: name shown on leaderboards and lobbies
 */
export interface AIParticipant {
  deploymentId: RecordId; // References Deployment records
  modelId: RecordId; // References Model records
  displayName: string;
}

/**
 * Represents a message in the database.
 * - `text`: message contents
 * - `createdBy`: user id of message sender
 * - `createdAt`: when the message was sent
 */
export interface MessageRecord {
  text: string;
  createdBy: RecordId; // References User records
  createdAt: DateISO;
}

/**
 * Represents a forum post as it's stored in the database.
 * - `title`: post title
 * - `text`: post contents
 * - `createdAt`: when the thread was posted
 * - `createdBy`: user id of OP
 * - `comments`: replies to the post
 */
export interface ThreadRecord {
  title: string;
  text: string;
  createdAt: DateISO;
  createdBy: RecordId; // References User records
  comments: RecordId[]; // References Comment records
}

/**
 * Represents a user document in the database.
 * - `username`: Text username (a non-random key for looking up Auth records)
 * - `display`: A display name
 * - `createdAt`: when this user registered.
 * - `puzzleRatings`: per-game Glicko 2 puzzle ratings, distinct from match ratings (Story 1.8).
 *               Keyed by GameKey; a game appears once the user's first rated attempt lands.
 * - `puzzleStreak`: current and best historical daily puzzle solve streak (Story 1.8)
 * - `puzzleLastRatedAt`: per-game UTC date (YYYY-MM-DD) of the last RATED daily-puzzle
 *               attempt. Gates the rated-attempt economy: only the first unhinted
 *               attempt of the day per game moves rating/streak; practice attempts
 *               never touch this map. Optional — records predating the economy lack it.
 * - `following`: user ids this user follows (Story 3.9). Lives here rather than in a
 *               separate FollowRepo because reads are always per-user.
 * - `emailPrefs`: optional email subscription preferences (Story 1.13 extension)
 */
export interface UserRecord {
  username: string; // References Auth records
  display: string;
  createdAt: DateISO;
  puzzleRatings: Partial<Record<GameKey, GlickoRating>>; // Story 1.8
  puzzleStreak: PuzzleStreak; // Story 1.8
  puzzleLastRatedAt?: Partial<Record<GameKey, DateISO>>; // Story 1.7/1.12 rated economy
  following: RecordId[]; // References User records (Story 3.9)
  emailPrefs?: EmailPrefs; // Story 1.13 (Extension)
}

/* ============================================================================
 * New record types - GameNite Arena
 * ============================================================================ */

/**
 * A Glicko 2 rating triple. Defaults: rating=1500, rd=350, vol=0.06.
 * See: http://www.glicko.net/glicko/glicko2.pdf
 */
export interface GlickoRating {
  rating: number;
  rd: number; // rating deviation
  vol: number; // volatility
}

/**
 * Per-user daily puzzle solve streak.
 * - `current`: current consecutive-day streak
 * - `best`: best historical streak
 * - `lastSolvedAt`: ISO date of the most recent successful solve (used to detect streak breaks)
 */
export interface PuzzleStreak {
  current: number;
  best: number;
  lastSolvedAt?: DateISO;
}

/**
 * Per-user email subscription preferences. All boolean fields default to false
 * if absent at read time.
 */
export interface EmailPrefs {
  weeklyRecap?: boolean; // Story 1.13
}

/**
 * Represents a trained or training AI model owned by a user. (Story 2)
 *
 * - `userId`: owning user (Story 2.4)
 * - `gameKey`: which game this model is trained for
 * - `displayName`: human-readable name shown on leaderboards and model cards
 * - `sourceRef`: object-storage key for the uploaded .py heuristic file (Story 2.1)
 * - `artifactRef`: object-storage key for the trained .pth artifact; undefined until
 *                  the first training run completes successfully (Story 2.4)
 * - `forkedFrom`: id of the parent model if this is a fork (Story 2.13)
 * - `visibility`: "private" (default) or "public" (forkable by others, Story 2.13)
 * - `createdAt`: when the model record was first created
 * - `updatedAt`: last modification of any model field
 */
export interface ModelRecord {
  userId: RecordId; // References User records
  gameKey: GameKey;
  displayName: string;
  sourceRef: string;
  /**
   * Store-relative artifact name (`<modelId>.pth`) inside the artifact
   * store — never an absolute path. Resolve through
   * artifactStore.service.ts resolveArtifactRef().
   */
  artifactRef?: string;
  /** Integrity metadata recorded when the artifact was stored. */
  artifactMeta?: ArtifactMeta;
  forkedFrom?: RecordId; // References Model records (Story 2.13)
  visibility: "private" | "public";
  createdAt: DateISO;
  updatedAt: DateISO;
}

/**
 * Represents a training job for a model. (Story 2.2, 2.3, 2.10)
 *
 * - `modelId`: the model being trained
 * - `userId`: owner (for quick lookup without joining through model)
 * - `gameKey`: the game this training run is for
 * - `config`: hyperparameters and episode count
 * - `status`: lifecycle state
 * - `progress`: live progress, updated by the worker mid-run
 * - `checkpoints`: list of saved checkpoint artifacts that can be resumed from (Story 2.10)
 * - `error`: if status is "failed", the failure reason
 * - `createdAt`: when the job was queued
 * - `completedAt`: when the job ended (success or failure)
 */
export interface TrainingJobRecord {
  modelId: RecordId; // References Model records
  userId: RecordId; // References User records
  gameKey: GameKey;
  config: TrainingConfig;
  status: TrainingJobStatus;
  progress: TrainingProgress;
  checkpoints: TrainingCheckpoint[];
  error?: string;
  createdAt: DateISO;
  completedAt?: DateISO;
}

export type TrainingJobStatus = "queued" | "running" | "completed" | "failed" | "canceled";

export interface TrainingConfig {
  episodes: number;
  learningRate: number;
  /**
   * Additional hyperparameters. Kept open-shape so per-game-specific config
   * can be passed without schema changes. The training worker is responsible
   * for validating these.
   */
  extra?: { [key: string]: unknown };
}

export interface TrainingProgress {
  episodes: number;
  meanReward: number;
  winRate: number;
  updatedAt: DateISO;
}

export interface TrainingCheckpoint {
  episode: number;
  artifactRef: string;
  createdAt: DateISO;
}

/**
 * An expiring API token for the LOCAL training channel. The trainer exchanges
 * its password once (POST /api/training/token) and authenticates subsequent
 * session calls with the token, so the password never lives in training
 * loops or shell history. Keyed by the token string itself for O(1) lookup.
 * Expired records are ignored at auth time (the Repo interface has no
 * delete, so they age out with the store).
 */
export interface ArtifactMeta {
  bytes: number;
  sha256: string;
  uploadedAt: DateISO;
}

export interface TrainingTokenRecord {
  userId: RecordId; // References User records
  username: string;
  createdAt: DateISO;
  expiresAt: DateISO;
}

/**
 * Represents a runtime deployment slot for a trained model. (Story 2.5, 2.9)
 *
 * A user can have at most three active deployments per game (enforced in
 * service code, Story 2.7).
 *
 * - `modelId`: the trained model loaded into this slot
 * - `userId`: owner
 * - `gameKey`: which game this deployment is for
 * - `displayName`: how it appears on leaderboards (mirror of ModelRecord.displayName
 *                  at deploy time; can drift if the model is renamed)
 * - `status`: "active" (plays matches), "paused" (held but not matching),
 *             "retired" (deactivated, retained for history)
 * - `createdAt`: when first deployed
 * - `updatedAt`: last status or display name change
 */
export interface DeploymentRecord {
  modelId: RecordId; // References Model records
  userId: RecordId; // References User records
  gameKey: GameKey;
  displayName: string;
  status: "active" | "paused" | "retired";
  createdAt: DateISO;
  updatedAt: DateISO;
}

/**
 * Glicko 2 rating for one entity in one game. (Story 1.1, 1.2)
 *
 * Stored in RatingRepo under a deterministic composite key:
 *   `${entityType}:${entityId}:${gameKey}`
 * e.g. "human:1f4d-...-9b3a:nim" or "ai:7c2b-...-4e21:connect4"
 *
 * This deterministic-key pattern lets us look up any entity's rating in any
 * game in a single Repo.get() without scanning.
 */
export interface RatingRecord {
  entityId: RecordId; // userId or modelId
  entityType: "human" | "ai";
  gameKey: GameKey;
  rating: number; // default 1500
  rd: number; // default 350
  vol: number; // default 0.06
  gamesPlayed: number;
  lastUpdatedAt: DateISO;
}

/**
 * Builds the deterministic key for a RatingRecord. Use this in service code
 * instead of constructing the string manually.
 */
export function ratingKey(args: {
  entityType: "human" | "ai";
  entityId: RecordId;
  gameKey: GameKey;
}): string {
  return `${args.entityType}:${args.entityId}:${args.gameKey}`;
}

/**
 * Represents a completed, replayable game. (Story 3.1)
 *
 * A MatchRecord is created when a GameRecord finishes. The GameRecord's
 * `matchId` field is set to the new MatchRecord's id. GameRecord is mutable
 * during play; MatchRecord is immutable archival data after the game ends.
 *
 * - `gameId`: the original GameRecord this match was derived from
 * - `gameKey`: copied for convenience (no need to load the GameRecord)
 * - `rated`: whether this match contributed to ratings (Story 1.2)
 * - `participants`: snapshot of who played, with type discriminator
 * - `moves`: every move in order, with actor and timestamp
 * - `result`: outcome and rating changes applied
 * - `initialState`: per-game state before the first move, so the replay
 *   viewer can rebuild positions that aren't derivable from moves alone
 *   (e.g. the guess game's secret number)
 * - `createdAt`: when the match record was created (same as completedAt usually)
 * - `completedAt`: when the original game finished
 */
export interface MatchRecord {
  gameId: RecordId; // References Game records
  gameKey: GameKey;
  rated: boolean;
  participants: MatchParticipant[];
  moves: MatchMove[];
  result: MatchResult;
  initialState?: unknown;
  createdAt: DateISO;
  completedAt: DateISO;
}

export interface MatchParticipant {
  id: RecordId; // userId or modelId
  type: "human" | "ai";
  displayName: string;
}

export interface MatchMove {
  actor: RecordId; // userId or modelId from participants
  move: unknown; // per-game move shape (e.g., NimMove, GuessMove)
  timestamp: DateISO;
}

export interface MatchResult {
  winnerId?: RecordId; // absent for draws
  outcome: "win" | "draw" | "abandoned" | "forfeit";
  ratingChanges?: { entityId: RecordId; delta: number }[];
}

/**
 * A user annotation on a specific move of a match. (Story 3.4, 3.11)
 *
 * - `matchId`: the match being annotated
 * - `moveIndex`: 0-indexed position in MatchRecord.moves
 * - `text`: free-text note
 * - `marker`: optional quality marker for the move
 * - `authorId`: user who wrote the annotation
 * - `visibility`: "private" (only author) or "shared" (anyone with shareToken)
 * - `shareToken`: present iff visibility === "shared"; used as URL parameter
 *                 on study links (Story 3.11)
 * - `createdAt`, `editedAt`: timestamps
 */
export interface AnnotationRecord {
  matchId: RecordId; // References Match records
  moveIndex: number;
  text: string;
  marker?: AnnotationMarker;
  authorId: RecordId; // References User records
  visibility: "private" | "shared";
  shareToken?: string;
  createdAt: DateISO;
  editedAt?: DateISO;
}

export type AnnotationMarker = "good" | "interesting" | "questionable" | "bad" | "winning";

/**
 * A stored annotation expanded with its repository id, as returned by the
 * annotation API. (`AnnotationRecord` itself does not carry its own key.)
 */
export type AnnotationInfo = AnnotationRecord & { annotationId: RecordId };

/**
 * A daily puzzle for a specific game. (Story 1.6, 1.7)
 *
 * Stored under a deterministic key `${gameKey}:${dateYYYYMMDD}` so the daily
 * lookup is a single Repo.get() with no scanning.
 *
 * - `gameKey`: which game
 * - `date`: the day this is the featured puzzle (ISO date, time stripped)
 * - `position`: the per-game state the user is asked to solve from
 * - `solution`: the engine's preferred move (or short sequence) plus optional
 *               explanation text
 * - `sourceMatchId`: optional pointer back to the match this position was
 *                    mined from (Story 1.6 "from replay archive")
 * - `createdAt`: when the puzzle record was created
 */
export interface PuzzleRecord {
  gameKey: GameKey;
  date: DateISO;
  position: unknown;
  solution: PuzzleSolution;
  sourceMatchId?: RecordId; // References Match records
  createdAt: DateISO;
}

export interface PuzzleSolution {
  moves: unknown[]; // per-game move shape
  explanation?: string;
}

/**
 * Builds the deterministic key for a daily puzzle. Pass a Date; the function
 * truncates to YYYY-MM-DD in UTC.
 */
export function dailyPuzzleKey(args: { gameKey: GameKey; date: Date }): string {
  const ymd = args.date.toISOString().slice(0, 10); // "2026-06-04"
  return `${args.gameKey}:${ymd}`;
}

/**
 * A user or AI's attempt at a puzzle. (Story 1.7, 1.10, 1.12)
 *
 * - `puzzleId`: which puzzle
 * - `attemptedBy`: who solved it (with human/AI discriminator)
 * - `success`: pass/fail
 * - `timeMs`: how long the attempt took (used for the daily fastest-solvers list)
 * - `hintsUsed`: count of hints revealed; any hint makes the attempt practice —
 *                the hint shows the winning move, so it can never gain rating (Story 1.12)
 * - `eloDelta`: change applied to the entity's puzzle rating (always 0 for practice attempts)
 * - `createdAt`: when the attempt was submitted
 */
export interface PuzzleAttemptRecord {
  puzzleId: RecordId; // References Puzzle records
  attemptedBy: PuzzleAttempter;
  success: boolean;
  /** Whether this attempt moved the user's puzzle rating. Optional because
   * records written before the profile rework lack it — readers fall back
   * to `eloDelta !== 0`. */
  rated?: boolean;
  timeMs: number;
  hintsUsed: number;
  eloDelta: number;
  createdAt: DateISO;
}

export interface PuzzleAttempter {
  id: RecordId; // userId or modelId
  type: "human" | "ai";
}

/**
 * A server-side record that a user was shown the hint for a puzzle. The
 * rated economy keys off this (a hinted puzzle can never be a rated solve),
 * so hint state cannot live client-side. Keyed by `puzzleHintKey()`.
 */
export interface PuzzleHintRecord {
  userId: RecordId;
  puzzleId: RecordId; // "<gameKey>:<YYYY-MM-DD>"
  grantedAt: DateISO;
}

/** Deterministic key for a hint grant: one per user per puzzle. */
export function puzzleHintKey(userId: RecordId, puzzleId: RecordId): string {
  return `${userId}|${puzzleId}`;
}

/**
 * A live broadcast of an in-progress game. (Story 3.7, 3.8)
 *
 * - `gameId`: the game being broadcast
 * - `broadcasterId`: the user who started the broadcast
 * - `delaySec`: 0 to 60 seconds, set by broadcaster (Story 3.7)
 * - `status`: lifecycle state
 * - `chatChannel`: id of the chat record used by this broadcast's audience
 * - `startedAt`, `endedAt`: timestamps
 */
export interface BroadcastRecord {
  gameId: RecordId; // References Game records
  broadcasterId: RecordId; // References User records
  delaySec: number;
  status: "live" | "ended";
  chatChannel: RecordId; // References Chat records
  startedAt: DateISO;
  endedAt?: DateISO;
}

/**
 * A per-channel block list entry. (Story 3.8)
 *
 * Stored under a deterministic composite key `${channelId}:${blockerId}:${blockedUserId}`
 * so we can both look up specific block pairs in O(1) and scan a channel's
 * full block list.
 *
 * - `channelId`: the broadcast or chat channel where the block applies
 * - `blockerId`: who set the block
 * - `blockedUserId`: who is blocked from chatting
 * - `createdAt`: when the block was set
 */
export interface ChannelBlockRecord {
  channelId: RecordId; // References Broadcast or Chat records
  blockerId: RecordId; // References User records
  blockedUserId: RecordId; // References User records
  createdAt: DateISO;
}

export function channelBlockKey(args: {
  channelId: RecordId;
  blockerId: RecordId;
  blockedUserId: RecordId;
}): string {
  return `${args.channelId}:${args.blockerId}:${args.blockedUserId}`;
}

/**
 * Append-only log of applied migrations. (Migration framework)
 *
 * Stored under the migration id as key (so duplicate applies are impossible).
 * See server/src/migrations/MigrationRunner.ts.
 */
export interface MigrationLogRecord {
  id: string; // e.g. "000_sprint1_arena_baseline"
  description: string;
  appliedAt: DateISO;
  durationMs: number;
}
