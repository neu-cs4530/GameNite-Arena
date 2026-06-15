/**
 * Follow service — REAL endpoints (/api/follow, Story 3.9). No mock fallback:
 * the follower feed and follow graph are live social data, so an empty result
 * is an honest empty state, not fixture data.
 *
 * Server (follow.controller.ts):
 *   POST /api/follow/feed                 { auth }            -> FollowFeed
 *   POST /api/follow/:username            { auth }            -> SafeUserInfo[] (updated following)
 *   POST /api/follow/:username/unfollow   { auth }            -> SafeUserInfo[] (updated following)
 *   GET  /api/follow/:username/followers                      -> SafeUserInfo[]
 *   GET  /api/follow/:username/following                      -> SafeUserInfo[]
 */

import type { FollowFeed, SafeUserInfo, UserAuth } from "@gamenite/shared";
import { api } from "./api.ts";

/** The authed user's home follower feed (followed accounts + recent replays). */
export async function getFollowFeed(auth: UserAuth): Promise<FollowFeed> {
  const res = await api.post<FollowFeed>("/api/follow/feed", { auth });
  return res.data;
}

/** Follow an account; returns the caller's updated following list. */
export async function follow(username: string, auth: UserAuth): Promise<SafeUserInfo[]> {
  const res = await api.post<SafeUserInfo[]>(`/api/follow/${encodeURIComponent(username)}`, {
    auth,
  });
  return res.data;
}

/** Unfollow an account; returns the caller's updated following list. */
export async function unfollow(username: string, auth: UserAuth): Promise<SafeUserInfo[]> {
  const res = await api.post<SafeUserInfo[]>(
    `/api/follow/${encodeURIComponent(username)}/unfollow`,
    { auth },
  );
  return res.data;
}

/** Accounts that follow `username` (public read). */
export async function listFollowers(username: string): Promise<SafeUserInfo[]> {
  const res = await api.get<SafeUserInfo[]>(
    `/api/follow/${encodeURIComponent(username)}/followers`,
  );
  return res.data;
}

/** Accounts `username` follows (public read). */
export async function listFollowing(username: string): Promise<SafeUserInfo[]> {
  const res = await api.get<SafeUserInfo[]>(
    `/api/follow/${encodeURIComponent(username)}/following`,
  );
  return res.data;
}
