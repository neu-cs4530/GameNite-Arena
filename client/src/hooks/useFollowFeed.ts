import { useCallback } from "react";
import type { FollowFeed } from "@gamenite/shared";
import useAsync, { type AsyncResult } from "./useAsync.ts";
import useAuth from "./useAuth.ts";
import { getFollowFeed } from "../services/followService.ts";

/**
 * The authed user's follower feed. A snapshot fetched on mount — intentionally
 * NOT live: a game that ends while you're scrolling stays put until you
 * navigate away and come back (which re-mounts and refetches).
 */
export default function useFollowFeed(): AsyncResult<FollowFeed> {
  const auth = useAuth();
  const producer = useCallback(() => getFollowFeed(auth), [auth]);
  return useAsync(producer, [auth]);
}
