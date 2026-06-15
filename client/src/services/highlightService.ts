/**
 * Highlight (match bookmark) service — REAL endpoints (/api/highlight, Story
 * 3.12). The broadcaster presses Highlight during a live broadcast to bookmark
 * the current moment; they can list their saved highlights for the bookmarked
 * matches page. No mock fallback — saved highlights are real user data.
 *
 * Server (highlight.controller.ts):
 *   POST /api/highlight/create  { auth, payload: { gameId|broadcastId, movesBack?, note? } } -> HighlightInfo
 *   POST /api/highlight/list    { auth }                                                     -> HighlightInfo[]
 */

import type { CreateHighlightPayload, HighlightInfo, UserAuth } from "@gamenite/shared";
import { api } from "./api.ts";

/**
 * Save a clip of the last `movesBack` moves of a match (defaults to 7, or all
 * if shorter). Identify the match by `broadcastId` (clip a live broadcast) or
 * `gameId` (highlight a game you're playing).
 */
export async function createHighlight(
  auth: UserAuth,
  payload: CreateHighlightPayload,
): Promise<HighlightInfo> {
  const res = await api.post<HighlightInfo>("/api/highlight/create", { auth, payload });
  return res.data;
}

/** The authed user's bookmarked highlights, most recently captured first. */
export async function listMyHighlights(auth: UserAuth): Promise<HighlightInfo[]> {
  const res = await api.post<HighlightInfo[]>("/api/highlight/list", { auth });
  return res.data;
}
