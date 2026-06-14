/**
 * MatchRecorder — captures gameplay moves and writes a single archival
 * {@link MatchRecord} (models.ts shape) when the game ends.
 *
 * The recorder buffers moves in memory through the game's lifetime. Only the
 * finalized record is persisted, which matches the immutable-archival
 * semantics documented on MatchRecord. If the process crashes mid-match, the
 * in-flight buffer is lost — acceptable for the in-memory storage profile we
 * use today; once a real DB-backed `MatchRepo` is wired in, the same
 * single-write pattern still applies.
 *
 * Call site is the single `captureMove(game, gameId, actor, move, done)`
 * in server/src/services/game.service.ts:updateGame(). The recorder figures
 * out the lifecycle (first move → start tracking, every move → buffer, done
 * → finalize and write) on its own — no per-game changes required.
 *
 * Winner inference: updateGame maps the GameLogic `winnerIndex` hook to a
 * userId and passes it to captureMove. A known winner archives as
 * `{ outcome: "win", winnerId }`, an explicit null archives as a draw, and
 * games without the hook archive a winnerless `{ outcome: "win" }`.
 *
 * Abandoned games: there is no leave/forfeit/timeout flow on the server, so
 * cleanup is lazy — every captureMove first sweeps tracked games that have
 * been idle longer than DEFAULT_IDLE_TIMEOUT_MS and finalizes them as
 * `{ outcome: "abandoned" }`. Activity triggers cleanup, so no timers are
 * needed; a fully idle process keeps stale entries buffered until the next
 * move on any game, which is acceptable for the in-memory profile.
 */

import {
  type GameRecord,
  type MatchParticipant,
  type MatchMove,
  type MatchRecord,
  type MatchResult,
} from "../models.ts";
import { MatchRepo as matchRepoStore, UserRepo } from "../repository.ts";
import { type MatchRepo } from "./matchRepo.service.ts";

export type DisplayNameResolver = (userId: string) => Promise<string>;

/**
 * Tracked games idle for longer than this are finalized as abandoned by the
 * lazy sweep at the top of captureMove.
 */
export const DEFAULT_IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

const defaultDisplayNameResolver: DisplayNameResolver = async (userId) => {
  const record = await UserRepo.find(userId);
  return record?.display ?? userId;
};

export interface RecorderDependencies {
  database: MatchRepo;
  /** Resolves a human userId to a display name. Defaults to UserRepo. */
  resolveDisplayName?: DisplayNameResolver;
  /** Defaults to `Date.now()`. Override for deterministic tests. */
  getCurrentTime?: () => number;
}

interface InProgressMatch {
  gameKey: GameRecord["type"];
  rated: boolean;
  humanIds: string[];
  aiParticipants: { id: string; displayName: string }[];
  moves: MatchMove[];
  initialState?: unknown;
  createdAt: string;
  /** Epoch ms of the most recent captured move (via the injected clock). */
  lastMoveAt: number;
}

export class MatchRecorder {
  private readonly _database: MatchRepo;
  private readonly _resolveDisplayName: DisplayNameResolver;
  private readonly _getCurrentTime: () => number;
  private readonly _inProgress = new Map<string, InProgressMatch>();
  /**
   * Games whose finalize has begun. Checked synchronously at the top of
   * captureMove so a concurrent duplicate of the final move can neither
   * append to the buffer mid-finalize nor re-finalize and overwrite the
   * archive (updateGame has no per-game locking, so duplicate submissions
   * of the same move can race).
   */
  private readonly _finalized = new Set<string>();

  constructor(deps: RecorderDependencies) {
    this._database = deps.database;
    this._resolveDisplayName = deps.resolveDisplayName ?? defaultDisplayNameResolver;
    this._getCurrentTime = deps.getCurrentTime ?? (() => Date.now());
  }

  /** True iff this gameId is currently being tracked. */
  isRecording(gameId: string): boolean {
    return this._inProgress.has(gameId);
  }

  /** Clears all recorder state. Test hook — never call in production code. */
  resetForTests(): void {
    this._inProgress.clear();
    this._finalized.clear();
  }

  /**
   * Capture one validated move. Internally:
   *   - sweeps idle (abandoned) games — see {@link sweepIdleMatches}
   *   - starts tracking if this is the first move for `gameId`
   *   - appends the move to the in-memory buffer
   *   - if `done`, finalizes the record and persists to MatchRepo
   *
   * @param game     The GameRecord at the time the move was accepted.
   * @param gameId   The id under which `game` is stored in GameRepo.
   * @param actor    The userId / modelId who made the move.
   * @param move     The canonical (schema-parsed) move payload, stored as-is
   *   on `MatchMove.move`. The caller falls back to the raw payload for games
   *   without a `parseMove` hook.
   * @param done     Whether this move ended the game.
   * @param stateBeforeMove The per-game state before this move was applied.
   *   Captured on the first move as the record's `initialState` so replays
   *   can rebuild positions not derivable from moves (e.g. guess's secret).
   * @param winnerId Only meaningful when `done`: the winner's userId, null
   *   for a draw, or undefined when the game logic has no winner hook.
   */
  async captureMove(
    game: GameRecord,
    gameId: string,
    actor: string,
    move: unknown,
    done: boolean,
    stateBeforeMove?: unknown,
    winnerId?: string | null,
  ): Promise<void> {
    if (this._finalized.has(gameId)) return;

    // Lazy abandoned-game cleanup: gameplay activity is the trigger, so the
    // _inProgress map can't leak forever without needing a background timer.
    // The game being captured is skipped — it's active by definition, and a
    // long-idle game whose player finally returns should still archive
    // normally rather than as abandoned. The sweep only awaits when an idle
    // game actually exists, preserving the synchronous finalized-guard
    // invariant (below) on the hot path.
    if (this._collectIdleIds(DEFAULT_IDLE_TIMEOUT_MS, gameId).length > 0) {
      await this.sweepIdleMatches(DEFAULT_IDLE_TIMEOUT_MS, gameId);
      // Re-check: a concurrent duplicate may have finalized this game while
      // the sweep was awaiting.
      if (this._finalized.has(gameId)) return;
    }

    const now = this._getCurrentTime();
    const nowIso = new Date(now).toISOString();

    let entry = this._inProgress.get(gameId);
    if (!entry) {
      entry = this._startTracking(game, stateBeforeMove, now);
      this._inProgress.set(gameId, entry);
    }

    entry.moves.push({ actor, move, timestamp: nowIso });
    entry.lastMoveAt = now;

    if (done) {
      // _finalize marks the game finalized before its first await so a racing
      // duplicate of the final move exits at the guard above instead of
      // corrupting the buffer.
      await this._finalize(gameId, entry, this._buildResult(winnerId));
    }
  }

  /**
   * Finalizes a game as a forfeit (CoS 2.8): persists the buffered moves
   * with result `{ outcome: "forfeit", winnerId }`. If the game had no
   * captured moves yet (a model striking out on its opening move), an entry
   * is synthesized from the game record so the forfeit still archives.
   * No-op for already-finalized games.
   */
  async finalizeAsForfeit(game: GameRecord, gameId: string, winnerId: string): Promise<void> {
    if (this._finalized.has(gameId)) return;
    const entry =
      this._inProgress.get(gameId) ?? this._startTracking(game, game.state, this._getCurrentTime());
    await this._finalize(gameId, entry, { outcome: "forfeit", winnerId });
  }

  /**
   * Finalizes a tracked game as abandoned: persists the buffered moves with
   * result `{ outcome: "abandoned" }` (no winner), clears the in-progress
   * entry, and marks the game finalized. No-op for untracked or
   * already-finalized games.
   */
  async finalizeAsAbandoned(gameId: string): Promise<void> {
    const entry = this._inProgress.get(gameId);
    if (!entry || this._finalized.has(gameId)) return;
    await this._finalize(gameId, entry, { outcome: "abandoned" });
  }

  /**
   * Finalizes every tracked game whose last move is older than `maxIdleMs`
   * as abandoned. Called lazily from captureMove (with `skipGameId` set to
   * the game being captured) so cleanup needs no timers; callers with a real
   * forfeit/timeout flow can also invoke it directly.
   */
  async sweepIdleMatches(maxIdleMs: number, skipGameId?: string): Promise<void> {
    for (const gameId of this._collectIdleIds(maxIdleMs, skipGameId)) {
      await this.finalizeAsAbandoned(gameId);
    }
  }

  /**
   * Builds the in-progress entry for a game the recorder hasn't seen yet.
   * AI seats sit in `game.players` under their deployment ids (positional
   * with `game.aiPlayers`), so they're excluded from the human side and
   * archived from the AIParticipant snapshot instead.
   */
  private _startTracking(game: GameRecord, initialState: unknown, now: number): InProgressMatch {
    const aiParticipants = game.aiPlayers.filter((p) => p !== null && p !== undefined);
    const aiSeatIds = new Set(aiParticipants.map((p) => p.deploymentId));
    return {
      gameKey: game.type,
      rated: game.rated,
      humanIds: game.players.filter((id) => !aiSeatIds.has(id)),
      aiParticipants: aiParticipants.map((p) => ({ id: p.modelId, displayName: p.displayName })),
      moves: [],
      initialState,
      createdAt: new Date(now).toISOString(),
      lastMoveAt: now,
    };
  }

  /** Ids of tracked games whose last move is older than `maxIdleMs`. */
  private _collectIdleIds(maxIdleMs: number, skipGameId?: string): string[] {
    const now = this._getCurrentTime();
    return [...this._inProgress.entries()]
      .filter(([gameId, entry]) => gameId !== skipGameId && now - entry.lastMoveAt > maxIdleMs)
      .map(([gameId]) => gameId);
  }

  /** Persists the final record and clears tracking state for `gameId`. */
  private async _finalize(
    gameId: string,
    entry: InProgressMatch,
    result: MatchResult,
  ): Promise<void> {
    // Mark finalized before the first await so concurrent captures for this
    // game exit at the guard at the top of captureMove.
    this._finalized.add(gameId);
    const nowIso = new Date(this._getCurrentTime()).toISOString();
    const moves = [...entry.moves];
    const participants = await this._buildParticipants(entry);
    const record: MatchRecord = {
      gameId,
      gameKey: entry.gameKey,
      rated: entry.rated,
      participants,
      moves,
      result,
      initialState: entry.initialState,
      createdAt: entry.createdAt,
      completedAt: nowIso,
    };
    await this._database.saveMatch(record);
    this._inProgress.delete(gameId);
  }

  private async _buildParticipants(entry: InProgressMatch): Promise<MatchParticipant[]> {
    const humans = await Promise.all(
      entry.humanIds.map(async (id) => ({
        id,
        type: "human" as const,
        displayName: await this._resolveDisplayName(id),
      })),
    );
    const ais = entry.aiParticipants.map(
      (p): MatchParticipant => ({
        id: p.id,
        type: "ai",
        displayName: p.displayName,
      }),
    );
    return [...humans, ...ais];
  }

  /**
   * Maps the winner inference (already resolved to a userId by updateGame)
   * to the archival MatchResult shape.
   */
  private _buildResult(winnerId: string | null | undefined): MatchResult {
    // Explicit null from the game's winnerIndex hook means a draw.
    if (winnerId === null) return { outcome: "draw" };
    if (winnerId !== undefined) return { outcome: "win", winnerId };
    // TODO: the game logic has no winnerIndex hook — record that the game
    // ended cleanly without claiming a winner. Remove once every game
    // implements the hook.
    return { outcome: "win" };
  }
}

/**
 * Production recorder singleton. Finalized matches land in the Keyv-backed
 * `MatchRepo` from repository.ts under the gameId as key — the same repo
 * puzzle.service.ts and replay.service.ts read from. Storage backend follows
 * the global Keyv initializer (in-memory by default, MongoDB when MONGO_STR
 * is configured at startup).
 */
export const matchRecorder = new MatchRecorder({
  database: { saveMatch: (record) => matchRepoStore.set(record.gameId, record) },
});
