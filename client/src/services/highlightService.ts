/**
 * Highlight (match bookmark) service — REAL endpoints (/api/highlight, Story
 * 3.12). The broadcaster presses Highlight during a live broadcast to bookmark
 * the current moment; they can list their saved highlights for the bookmarked
 * matches page. No mock fallback — saved highlights are real user data.
 *
 * Server (highlight.controller.ts):
 *   POST /api/highlight/create  { auth, payload: { gameId, broadcastId?, note? } } -> HighlightInfo
 *   POST /api/highlight/list    { auth }                                           -> HighlightInfo[]
 */

import type { CreateHighlightPayload, HighlightInfo, UserAuth } from "@gamenite/shared";
import { api } from "./api.ts";

/**
 * Bookmark the current moment of a match. Allowed for a player in the game, or
 * (with `broadcastId`) the broadcaster of that broadcast.
 */
export async function createHighlight(
  gameId: string,
  auth: UserAuth,
  opts: { broadcastId?: string; note?: string } = {},
): Promise<HighlightInfo> {
  const payload: CreateHighlightPayload = { gameId, ...opts };
  const res = await api.post<HighlightInfo>("/api/highlight/create", { auth, payload });
  return res.data;
}

/** The authed user's bookmarked highlights, most recently captured first. */
export async function listMyHighlights(auth: UserAuth): Promise<HighlightInfo[]> {
  const res = await api.post<HighlightInfo[]>("/api/highlight/list", { auth });
  return res.data;
}
