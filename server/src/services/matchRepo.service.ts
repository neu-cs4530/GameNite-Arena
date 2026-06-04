// Zach: once the matches and replays tables exist, implement this interface
// against the DB layer

import {
  type MatchOutcome,
  type MatchRecord,
  type RecordedMove,
  type ReplayRecord,
} from '@gamenite/shared';

export interface MatchRepo {
  // Insert a row in matches when a game begins
  createMatch(matchRecord: MatchRecord): Promise<void>;

  /**
   * Persist a single move. Called on every turn.
   * If the process dies mid-match we still have everything up to the last saved move.
   */
  saveMove(gameId: string, move: RecordedMove): Promise<void>;

  // Stamp the match row as finished with its final outcome and move count
  closeMatch(
    gameId: string,
    finalDetails: { endedAt: number; outcome: MatchOutcome; totalMoves: number },
  ): Promise<void>;

  // Store the full replay blob so the replay viewer can load it in one shot
  saveReplay(replay: ReplayRecord): Promise<void>;
}

// Used by unit tests and fine for local dev before the real schema is created
export class InMemoryMatchRepo implements MatchRepo {
  readonly matchRecords  = new Map<string, MatchRecord>();
  readonly movesByGame   = new Map<string, RecordedMove[]>();
  readonly replaysByGame = new Map<string, ReplayRecord>();

  async createMatch(matchRecord: MatchRecord): Promise<void> {
    this.matchRecords.set(matchRecord.gameId, { ...matchRecord });
    this.movesByGame.set(matchRecord.gameId, []);
  }

  async saveMove(gameId: string, move: RecordedMove): Promise<void> {
    const movesForThisGame = this.movesByGame.get(gameId);
    if (!movesForThisGame) {
      throw new Error(`saveMove called for unknown game ${gameId}`);
    }
    movesForThisGame.push({ ...move });
  }

  async closeMatch(
    gameId: string,
    finalDetails: { endedAt: number; outcome: MatchOutcome; totalMoves: number },
  ): Promise<void> {
    const matchRecord = this.matchRecords.get(gameId);
    if (!matchRecord) throw new Error(`closeMatch called for unknown game ${gameId}`);
    matchRecord.endedAt    = finalDetails.endedAt;
    matchRecord.outcome    = finalDetails.outcome;
    matchRecord.totalMoves = finalDetails.totalMoves;
  }

  async saveReplay(replay: ReplayRecord): Promise<void> {
    this.replaysByGame.set(replay.gameId, {
      ...replay,
      moveHistory: [...replay.moveHistory],
    });
  }
}