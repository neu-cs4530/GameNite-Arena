import { type TaggedGameView } from "./game.types.ts";

/** Lifecycle state of a broadcast. */
export type BroadcastStatus = "live" | "ended";

/**
 * A broadcast as returned by the broadcast API: the stored record plus its
 * repository id. (Story 3.7)
 */
export interface BroadcastInfo {
  broadcastId: string;
  gameId: string;
  broadcasterId: string;
  /** Broadcaster-set delay applied to the spectator feed, 0 to 60 seconds. */
  delaySec: number;
  status: BroadcastStatus;
  chatChannel: string;
  startedAt: string;
  endedAt?: string;
}

/** Request body to start a broadcast of an in-progress game. (Story 3.7) */
export interface StartBroadcastPayload {
  gameId: string;
  /** Broadcaster-set delay, 0 to 60 seconds. */
  delaySec: number;
}

/**
 * A delayed game-state update relayed to a broadcast's spectators. Carries the
 * same watcher-facing view the live game room receives, emitted `delaySec`
 * later. (Story 3.7)
 */
export interface BroadcastStateUpdatePayload {
  broadcastId: string;
  view: TaggedGameView;
}

/** Emitted to a broadcast's room when the broadcast ends. */
export interface BroadcastEndedPayload {
  broadcastId: string;
}
