/**
 * Follower service — SCAFFOLD. The backend isn't built yet (Story 3.9, only
 * `UserRecord.following` exists), so every call attempts the proposed real
 * route and, when it isn't there (404/network), reports `available: false`
 * instead of fabricating followers. The UI renders an honest "waiting for
 * backend" state. When the backend lands, these functions start returning
 * real data with ZERO change to callers.
 *
 * Proposed routes (see shared/src/follower.types.ts):
 *   GET /api/user/:username/followers -> FollowListResponse
 *   GET /api/user/:username/following -> FollowListResponse
 *   GET /api/follow/feed              -> FollowingFeedResponse
 */

import type { FollowListResponse, FollowingFeedResponse } from "@gamenite/shared";
import { api } from "./api.ts";
import { isFallbackEligible } from "./serviceFallback.ts";

/** Either real backend data, or a signal that the backend isn't built yet. */
export type Scaffolded<T> = { available: true; data: T } | { available: false };

async function tryGet<T>(url: string): Promise<Scaffolded<T>> {
  try {
    const res = await api.get<T>(url);
    return { available: true, data: res.data };
  } catch (err) {
    // Route/endpoint not implemented yet → show the waiting placeholder.
    if (isFallbackEligible(err)) return { available: false };
    throw err;
  }
}

export function getFollowers(username: string): Promise<Scaffolded<FollowListResponse>> {
  return tryGet<FollowListResponse>(`/api/user/${encodeURIComponent(username)}/followers`);
}

export function getFollowing(username: string): Promise<Scaffolded<FollowListResponse>> {
  return tryGet<FollowListResponse>(`/api/user/${encodeURIComponent(username)}/following`);
}

export function getFollowingFeed(): Promise<Scaffolded<FollowingFeedResponse>> {
  return tryGet<FollowingFeedResponse>(`/api/follow/feed`);
}
