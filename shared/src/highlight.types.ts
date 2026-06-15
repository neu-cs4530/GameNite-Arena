/**
 * A bookmarked moment in a match (Story 3.12). Created by a player highlighting
 * the game they're in (or a broadcaster highlighting their live broadcast).
 * Saved highlights show up in the user's bookmarked matches.
 */
export interface HighlightInfo {
  highlightId: string;
  gameId: string;
  /** Who pressed Highlight (a player, or the broadcaster). */
  userId: string;
  /** Present when the moment was captured from a live broadcast. */
  broadcastId?: string;
  /** Optional short label the user can attach to the moment. */
  note?: string;
  /** ISO timestamp of when Highlight was pressed. */
  capturedAt: string;
}

/** Request body to bookmark the current moment of a match. (Story 3.12) */
export interface CreateHighlightPayload {
  gameId: string;
  /** Set when highlighting from a live broadcast view. */
  broadcastId?: string;
  note?: string;
}
