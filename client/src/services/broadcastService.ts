/**
 * Live broadcast service — REAL ONLY (no mock fallback).
 *
 * Broadcasts are live by definition, so a fixture would be meaningless: when
 * the server has no live broadcasts the dashboard renders an honest empty
 * state, not fabricated games. Backs the live-games dashboard and viewer.
 *
 * Server endpoints (broadcast.controller.ts):
 *   GET /api/broadcast/list   -> BroadcastInfo[]   (live only, newest-first)
 *   GET /api/broadcast/:id    -> BroadcastInfo | 404
 *
 * Spectating itself (joining the delayed feed + chat) happens over sockets,
 * not REST — see useBroadcast / useSocketsForBroadcastChat.
 */

import type { BroadcastInfo } from "@gamenite/shared";
import { api } from "./api.ts";

/** All currently-live broadcasts, newest first. */
export async function listLiveBroadcasts(): Promise<BroadcastInfo[]> {
  const res = await api.get<BroadcastInfo[]>("/api/broadcast/list");
  return res.data;
}

/** A single broadcast by id. Throws (axios 404) when it doesn't exist. */
export async function getBroadcast(broadcastId: string): Promise<BroadcastInfo> {
  const res = await api.get<BroadcastInfo>(`/api/broadcast/${encodeURIComponent(broadcastId)}`);
  return res.data;
}
