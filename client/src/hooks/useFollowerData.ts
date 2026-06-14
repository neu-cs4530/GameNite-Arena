import { useCallback } from "react";
import type { FollowListResponse, FollowingFeedResponse } from "@gamenite/shared";
import useAsync, { type AsyncResult } from "./useAsync.ts";
import {
  getFollowers,
  getFollowing,
  getFollowingFeed,
  type Scaffolded,
} from "../services/followerService.ts";

/**
 * SCAFFOLD hooks for the follower feature. They resolve to
 * `{ available: false }` until the backend exists; the UI uses that to render
 * a "waiting for backend" placeholder rather than fabricated data. Shapes
 * mirror the rest of the app's useAsync-based data hooks so wiring real data
 * in later is a no-op for callers.
 */
export function useFollowers(
  username: string | undefined,
): AsyncResult<Scaffolded<FollowListResponse>> {
  const producer = useCallback(() => getFollowers(username ?? ""), [username]);
  return useAsync(producer, [username]);
}

export function useFollowing(
  username: string | undefined,
): AsyncResult<Scaffolded<FollowListResponse>> {
  const producer = useCallback(() => getFollowing(username ?? ""), [username]);
  return useAsync(producer, [username]);
}

export function useFollowingFeed(): AsyncResult<Scaffolded<FollowingFeedResponse>> {
  const producer = useCallback(() => getFollowingFeed(), []);
  return useAsync(producer, []);
}
