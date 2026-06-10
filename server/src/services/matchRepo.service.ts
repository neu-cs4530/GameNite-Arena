/**
 * Storage abstraction for finalized matches.
 *
 * Wires through {@link MatchRecord} from models.ts — the canonical archival
 * shape consumed by the replay viewer and other readers (puzzle.service.ts
 * already reads from `repository.ts:MatchRepo` against the same shape).
 *
 * Reads happen elsewhere via the Keyv repo directly (see `repository.ts`).
 * The recorder only needs to write a single complete record at end-of-match,
 * so the interface is intentionally one method wide.
 */

import { type MatchRecord } from "../models.ts";

export interface MatchRepo {
  /** Persists a finalized match. Called once per game on end. */
  saveMatch(matchRecord: MatchRecord): Promise<void>;
}

/** In-memory implementation used by unit tests. */
export class InMemoryMatchRepo implements MatchRepo {
  readonly matches = new Map<string, MatchRecord>();

  saveMatch(matchRecord: MatchRecord): Promise<void> {
    this.matches.set(matchRecord.gameId, {
      ...matchRecord,
      moves: matchRecord.moves.map((m) => ({ ...m })),
      participants: matchRecord.participants.map((p) => ({ ...p })),
    });
    return Promise.resolve();
  }
}
