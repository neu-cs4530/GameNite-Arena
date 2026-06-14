/**
 * Follower feature wire types (Story 3.9). SCAFFOLD ONLY.
 *
 * The backend for these routes is NOT implemented yet — only the
 * `UserRecord.following` field exists. The client treats every follower
 * endpoint as "not available yet" and renders a waiting-for-backend
 * placeholder rather than fabricating data. These types pin the intended
 * REST contract so the real backend and UI can be wired up with minimal
 * change once it lands.
 *
 * Proposed routes (none exist yet):
 *   GET  /api/user/:username/followers  -> FollowListResponse
 *   GET  /api/user/:username/following  -> FollowListResponse
 *   POST /api/user/:username/follow     { auth, payload: {} } -> FollowActionResponse
 *   POST /api/user/:username/unfollow   { auth, payload: {} } -> FollowActionResponse
 *   GET  /api/follow/feed               -> FollowingFeedResponse  (auth'd)
 */

import type { GameKey } from "./game.types.ts";
import type { SafeUserInfo } from "./user.types.ts";

/** One follow relationship entry as the UI will render it. */
export interface FollowUser {
  user: SafeUserInfo;
  /** Whether the signed-in viewer follows this user, when the backend knows. */
  viewerFollows?: boolean;
}

/** Response for the followers / following list endpoints. */
export interface FollowListResponse {
  username: string;
  users: FollowUser[];
}

/** Result of a follow / unfollow mutation. */
export interface FollowActionResponse {
  success: boolean;
}

/** A followed user who is currently broadcasting a live game. */
export interface FollowingLiveItem {
  user: SafeUserInfo;
  broadcastId: string;
  gameKey: GameKey;
}

/** The follower feed: followed users who are live right now. */
export interface FollowingFeedResponse {
  live: FollowingLiveItem[];
}
