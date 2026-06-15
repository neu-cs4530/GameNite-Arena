/**
 * Pure helpers for the follower feed and follow lists. Keeping the
 * stories-filter / chronological-sort / is-following logic here makes it
 * unit-testable without rendering.
 */

import type { FollowFeed, GameInfo, SafeUserInfo } from "@gamenite/shared";
import type { ReplaySummary } from "./types.ts";

/** A followed account currently in a live game (currentGame narrowed non-null). */
export interface ActiveStory {
  user: SafeUserInfo;
  game: GameInfo;
}

/** Followed accounts currently in a live game — the "stories" row. */
export function activeStories(feed: FollowFeed): ActiveStory[] {
  return feed.following.flatMap((f) =>
    f.currentGame ? [{ user: f.user, game: f.currentGame }] : [],
  );
}

/** Feed replays, newest-first by completion time (does not mutate the input). */
export function feedReplaysChronological(feed: FollowFeed): ReplaySummary[] {
  return [...feed.replays].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}

/** Whether `username` appears in a following list — drives Follow/Following state. */
export function isFollowing(following: SafeUserInfo[], username: string): boolean {
  return following.some((u) => u.username === username);
}
