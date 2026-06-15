import { type FollowFeed, type GameInfo, type SafeUserInfo } from "@gamenite/shared";
import { UserRepo } from "../repository.ts";
import { getUserByUsername } from "./auth.service.ts";
import { populateSafeUserInfo } from "./user.service.ts";
import { getGames } from "./game.service.ts";
import { listReplays } from "./replay.service.ts";
import { type UserWithId } from "../types.ts";

/** How many recent replays to scan when assembling the feed. */
const FEED_REPLAY_SCAN = 100;

/**
 * Follow `targetUsername` on behalf of `follower`. Following yourself or an
 * already-followed account is a no-op.
 *
 * @param follower - The user doing the following
 * @param targetUsername - The account to follow
 * @returns the follower's updated following list
 * @throws if no user with `targetUsername` exists
 */
export async function followUser(
  follower: UserWithId,
  targetUsername: string,
): Promise<SafeUserInfo[]> {
  const target = await getUserByUsername(targetUsername);
  if (!target) throw new Error(`No user ${targetUsername}`);
  if (target.userId !== follower.userId) {
    const record = await UserRepo.get(follower.userId);
    // `following` may be absent on user records created before Story 3.9.
    const following = record.following ?? [];
    if (!following.includes(target.userId)) {
      record.following = [...following, target.userId];
      await UserRepo.set(follower.userId, record);
    }
  }
  return getFollowing(follower);
}

/**
 * Unfollow `targetUsername`. No-op if not currently following.
 *
 * @param follower - The user doing the unfollowing
 * @param targetUsername - The account to unfollow
 * @returns the follower's updated following list
 * @throws if no user with `targetUsername` exists
 */
export async function unfollowUser(
  follower: UserWithId,
  targetUsername: string,
): Promise<SafeUserInfo[]> {
  const target = await getUserByUsername(targetUsername);
  if (!target) throw new Error(`No user ${targetUsername}`);
  const record = await UserRepo.get(follower.userId);
  record.following = (record.following ?? []).filter((id) => id !== target.userId);
  await UserRepo.set(follower.userId, record);
  return getFollowing(follower);
}

/** The accounts `user` follows, as safe user info. */
export async function getFollowing(user: UserWithId): Promise<SafeUserInfo[]> {
  const record = await UserRepo.get(user.userId);
  // `following` may be absent on user records created before Story 3.9.
  return Promise.all((record.following ?? []).map(populateSafeUserInfo));
}

/**
 * The accounts `targetUsername` follows, as safe user info (public read).
 *
 * @throws if no user with `targetUsername` exists
 */
export async function listFollowing(targetUsername: string): Promise<SafeUserInfo[]> {
  const target = await getUserByUsername(targetUsername);
  if (!target) throw new Error(`No user ${targetUsername}`);
  return getFollowing(target);
}

/**
 * The accounts that follow `targetUsername`, as safe user info (public read).
 * Followers aren't stored directly, so this scans every user's `following`
 * list for the target — acceptable at this scale.
 *
 * @throws if no user with `targetUsername` exists
 */
export async function listFollowers(targetUsername: string): Promise<SafeUserInfo[]> {
  const target = await getUserByUsername(targetUsername);
  if (!target) throw new Error(`No user ${targetUsername}`);
  const ids = await UserRepo.getAllKeys();
  const records = await Promise.all(ids.map((id) => UserRepo.get(id)));
  const followerIds = ids.filter((_, i) => (records[i].following ?? []).includes(target.userId));
  return Promise.all(followerIds.map(populateSafeUserInfo));
}

/**
 * Build the home-page follower feed (Story 3.9): each followed account paired
 * with the live (active) match it's currently in, plus recent replays featuring
 * any followed account.
 *
 * @param user - The viewer whose follow list drives the feed
 */
export async function getFollowerFeed(user: UserWithId): Promise<FollowFeed> {
  const followingInfos = await getFollowing(user);
  const followedUsernames = new Set(followingInfos.map((u) => u.username));

  // The first active game each followed account appears in.
  const currentGameByUsername = new Map<string, GameInfo>();
  for (const game of await getGames()) {
    if (game.status !== "active") continue;
    for (const player of game.players) {
      if (followedUsernames.has(player.username) && !currentGameByUsername.has(player.username)) {
        currentGameByUsername.set(player.username, game);
      }
    }
  }

  const following = followingInfos.map((u) => ({
    user: u,
    currentGame: currentGameByUsername.get(u.username) ?? null,
  }));

  const page = await listReplays({ pageSize: FEED_REPLAY_SCAN });
  const replays = page.replays.filter((replay) =>
    replay.participants.some((p) => p.username !== undefined && followedUsernames.has(p.username)),
  );

  return { following, replays };
}
