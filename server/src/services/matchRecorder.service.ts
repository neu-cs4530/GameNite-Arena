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
 * Note (intentional gap): we don't infer the winner. Outcome defaults to
 * `"win"` with `winnerId: undefined`. Adding a per-game `winnerId(state,
 * players)` hook to GameLogic is a follow-up — it touches every game and
 * was out of scope for the recorder rewrite.
 */

import {
  type GameRecord,
  type MatchParticipant,
  type MatchMove,
  type MatchRecord,
  type MatchResult,
} from "../models.ts";
import { UserRepo } from "../repository.ts";
import { type MatchRepo } from "./matchRepo.service.ts";

export type DisplayNameResolver = (userId: string) => Promise<string>;

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
  createdAt: string;
}

export class MatchRecorder {
  private readonly _database: MatchRepo;
  private readonly _resolveDisplayName: DisplayNameResolver;
  private readonly _getCurrentTime: () => number;
  private readonly _inProgress = new Map<string, InProgressMatch>();

  constructor(deps: RecorderDependencies) {
    this._database = deps.database;
    this._resolveDisplayName = deps.resolveDisplayName ?? defaultDisplayNameResolver;
    this._getCurrentTime = deps.getCurrentTime ?? (() => Date.now());
  }

  /** True iff this gameId is currently being tracked. */
  isRecording(gameId: string): boolean {
    return this._inProgress.has(gameId);
  }

  /**
   * Capture one validated move. Internally:
   *   - starts tracking if this is the first move for `gameId`
   *   - appends the move to the in-memory buffer
   *   - if `done`, finalizes the record and persists to MatchRepo
   *
   * @param game   The GameRecord at the time the move was accepted.
   * @param gameId The id under which `game` is stored in GameRepo.
   * @param actor  The userId / modelId who made the move.
   * @param move   The raw move payload, stored as-is on `MatchMove.move`.
   * @param done   Whether this move ended the game.
   */
  async captureMove(
    game: GameRecord,
    gameId: string,
    actor: string,
    move: unknown,
    done: boolean,
  ): Promise<void> {
    const nowIso = new Date(this._getCurrentTime()).toISOString();

    let entry = this._inProgress.get(gameId);
    if (!entry) {
      entry = {
        gameKey: game.type,
        rated: game.rated,
        humanIds: [...game.players],
        aiParticipants: game.aiPlayers.map((p) => ({
          id: p.modelId,
          displayName: p.displayName,
        })),
        moves: [],
        createdAt: nowIso,
      };
      this._inProgress.set(gameId, entry);
    }

    entry.moves.push({ actor, move, timestamp: nowIso });

    if (done) {
      const participants = await this._buildParticipants(entry);
      const record: MatchRecord = {
        gameId,
        gameKey: entry.gameKey,
        rated: entry.rated,
        participants,
        moves: entry.moves,
        result: this._defaultResult(),
        createdAt: entry.createdAt,
        completedAt: nowIso,
      };
      await this._database.saveMatch(record);
      this._inProgress.delete(gameId);
    }
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
   * TODO: derive properly once GameLogic exposes a per-game winner hook.
   * For now record that the game ended cleanly without claiming a winner.
   */
  private _defaultResult(): MatchResult {
    return { outcome: "win" };
  }
}
