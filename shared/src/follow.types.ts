import { type GameInfo } from "./game.types.ts";
import { type ReplaySummary } from "./replay.types.ts";
import { type SafeUserInfo } from "./user.types.ts";

/** A followed account and the live match it's currently in, if any. (Story 3.9) */
export interface FollowedUserStatus {
  user: SafeUserInfo;
  /** The followed account's current active game, or null if it isn't playing. */
  currentGame: GameInfo | null;
}

/**
 * The home-page follower feed (Story 3.9): each followed account with the live
 * match it's currently in, plus recent replays featuring followed accounts.
 */
export interface FollowFeed {
  following: FollowedUserStatus[];
  replays: ReplaySummary[];
}
