// How a match ended, `aborted` covers disconnects or FF's
export type MatchOutcome = 'player_one_wins' | 'player_two_wins' | 'draw' | 'aborted';


// One move made by a player. 
export interface RecordedMove {
  // 0 index of this turn in the match
  userMove: number;
  // Which player (or model) took this turn. */
  playedBy: string;
  // The actual move, written out
  moveNotation: string;
  // Optional board-state checksum so the replay viewer can detect desyncs on playback
  boardChecksum?: string;
  // When this move was recorded
  playedAt: number;
}

// Everything the matches table needs 
export interface MatchRecord {
  gameId: string;
  gameType: string;
  players: [string, string];
  startedAt: number;
  endedAt?: number;
  outcome?: MatchOutcome;
  totalMoves: number;
}


// The blob the replay viewer
export interface ReplayRecord {
  gameId: string;
  gameType: string;
  players: [string, string];
  outcome: MatchOutcome;
  startedAt: number;
  endedAt: number;
  moveHistory: RecordedMove[];
}

// Needed to open a new match 
export interface StartMatchInput {
  gameId: string;
  gameType: string;
  players: [string, string];
}