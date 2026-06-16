/**
 * A bookmarked clip from a live broadcast (Story 3.12). Saved from the live
 * viewer, capturing the last `movesBack` moves of the match (or all if fewer).
 * Saved highlights show up in the user's bookmarked matches.
 */

import { type GameKey } from "./game.types.ts";

/** One move within a highlight clip. */
export interface HighlightMove {
  actor: string;
  move: unknown;
  timestamp: string;
}

export interface HighlightInfo {
  highlightId: string;
  gameId: string;
  /** Which game this clip is from, for display in the highlights list. */
  gameKey: GameKey;
  /** Who saved the highlight. */
  userId: string;
  /** The live broadcast the clip was captured from, if any. */
  broadcastId?: string;
  /** Optional short label the user can attach to the moment. */
  note?: string;
  /** How many trailing moves were requested. */
  movesBack: number;
  /** The captured clip (last `movesBack`, or all if fewer), in play order. */
  moves: HighlightMove[];
  /** Index of the clip's first move within the full match (for replay deep-link). */
  startIndex: number;
  /** ISO timestamp of when Highlight was pressed. */
  capturedAt: string;
}

/**
 * Request body to bookmark a clip of a match (Story 3.12). Identify the match
 * by `broadcastId` (clipping a live broadcast) or `gameId` (a player
 * highlighting their own game) — exactly one is required.
 */
export interface CreateHighlightPayload {
  gameId?: string;
  broadcastId?: string;
  /** How many trailing moves to capture; defaults to 7, clamped server-side. */
  movesBack?: number;
  note?: string;
}

/** Default number of trailing moves a highlight captures. */
export const DEFAULT_HIGHLIGHT_MOVES_BACK = 7;
/** Maximum trailing moves a highlight may capture. */
export const MAX_HIGHLIGHT_MOVES_BACK = 50;
