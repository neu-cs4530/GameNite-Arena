// What this file should do:
//   open a match: write the `matches` row immediately
//   record moves: persist EVERY move, in order, as it happens
//   close a match: finalize the row, save the replay blob

import {
  type MatchOutcome,
  type MatchRecord,
  type RecordedMove,
  type ReplayRecord,
  type StartMatchInput,
} from "@gamenite/shared";
import { type MatchRepo } from "./matchRepo.service.ts";

// Everything the recorder needs when building
export interface RecorderDependencies {
  database: MatchRepo;
  getCurrentTime?: () => number;
}

// Internal bookkeeping for a match that's currently being recorded
interface MatchInProgress {
  matchRecord: MatchRecord;
  movesBuffered: RecordedMove[];
  //Index of the next move we expect, helps with Illegal moves
  nextExpectedMove: number;
}

export class MatchRecorder {
  private readonly _database: MatchRepo;
  private readonly _getCurrentTime: () => number;

  // All games we're actively recording, keyed by gameId
  private readonly _ongoingMatches = new Map<string, MatchInProgress>();

  constructor(deps: RecorderDependencies) {
    this._database = deps.database;
    this._getCurrentTime = deps.getCurrentTime ?? (() => Date.now());
  }

  /**
   * Writes the `matches` row immediately so a game that crashes
   * before its first move still shows up as aborted rather than disappearing.
   */
  async startMatch(matchDetails: StartMatchInput): Promise<void> {
    if (this._ongoingMatches.has(matchDetails.gameId)) {
      throw new Error(`Game ${matchDetails.gameId} is already being recorded`);
    }

    const matchRecord: MatchRecord = {
      gameId: matchDetails.gameId,
      gameType: matchDetails.gameType,
      players: matchDetails.players,
      startedAt: this._getCurrentTime(),
      totalMoves: 0,
    };

    await this._database.createMatch(matchRecord);
    this._ongoingMatches.set(matchDetails.gameId, {
      matchRecord,
      movesBuffered: [],
      nextExpectedMove: 0,
    });
  }

  // Record a single move. Persisted to the DB.
  async recordMove(
    gameId: string,
    moveDetails: Omit<RecordedMove, "userMove" | "playedAt"> & { userMove?: number },
  ): Promise<void> {
    const matchInProgress = this._ongoingMatches.get(gameId);
    if (!matchInProgress) {
      throw new Error(`recordMove called for game ${gameId} that isn't active`);
    }

    if (
      moveDetails.userMove !== undefined &&
      moveDetails.userMove !== matchInProgress.nextExpectedMove
    ) {
      throw new Error(
        `Out-of-order move for game ${gameId}: ` +
          `expected userMove ${matchInProgress.nextExpectedMove}, ` +
          `but got ${moveDetails.userMove}`,
      );
    }

    const savedMove: RecordedMove = {
      userMove: matchInProgress.nextExpectedMove,
      playedBy: moveDetails.playedBy,
      moveNotation: moveDetails.moveNotation,
      boardChecksum: moveDetails.boardChecksum,
      playedAt: this._getCurrentTime(),
    };

    await this._database.saveMove(gameId, savedMove);

    // Only advance in-memory state AFTER the write succeeds. A failed DB
    // write won't push nextExpectedMove ahead of what's actually stored.
    matchInProgress.movesBuffered.push(savedMove);
    matchInProgress.nextExpectedMove += 1;
    matchInProgress.matchRecord.totalMoves = matchInProgress.nextExpectedMove;
  }

  /**
   * Close out a match: finalize the row and save the replay blob.
   * Returns the assembled replay so callers and tests can inspect it.
   */
  async endMatch(gameId: string, outcome: MatchOutcome): Promise<ReplayRecord> {
    const matchInProgress = this._ongoingMatches.get(gameId);
    if (!matchInProgress) {
      throw new Error(`endMatch called for game ${gameId} that isn't active`);
    }

    const endedAt = this._getCurrentTime();

    await this._database.closeMatch(gameId, {
      endedAt,
      outcome,
      totalMoves: matchInProgress.movesBuffered.length,
    });

    const replayRecord: ReplayRecord = {
      gameId,
      gameType: matchInProgress.matchRecord.gameType,
      players: matchInProgress.matchRecord.players,
      outcome,
      startedAt: matchInProgress.matchRecord.startedAt,
      endedAt,
      moveHistory: [...matchInProgress.movesBuffered],
    };
    await this._database.saveReplay(replayRecord);

    this._ongoingMatches.delete(gameId);
    return replayRecord;
  }

  // True if we're currently recording this game
  isRecording(gameId: string): boolean {
    return this._ongoingMatches.has(gameId);
  }
}
