/**
 * /api/follow/... — follow/unfollow accounts and read the home-page follower
 * feed (Story 3.9). The follow list lives on `UserRecord.following`; the feed
 * surfaces followed accounts' live matches plus their recent replays. Auth
 * rides in the request body, matching the rest of the REST API.
 */

import { zUserAuth, type FollowFeed, type SafeUserInfo } from "@gamenite/shared";
import { z } from "zod";
import { checkAuth } from "../services/auth.service.ts";
import { followUser, getFollowerFeed, unfollowUser } from "../services/follow.service.ts";
import { type RestAPI } from "../types.ts";

const zAuthOnly = z.object({ auth: zUserAuth });

/** Handle POST `/api/follow/:username` — follow that account. */
export const postFollow: RestAPI<SafeUserInfo[], { username: string }> = async (req, res) => {
  const body = zAuthOnly.safeParse(req.body);
  if (!body.success) {
    res.status(400).send({ error: "Poorly-formed request" });
    return;
  }
  const user = await checkAuth(body.data.auth);
  if (!user) {
    res.status(403).send({ error: "Invalid credentials" });
    return;
  }
  try {
    res.send(await followUser(user, req.params.username));
  } catch {
    res.status(404).send({ error: "User not found" });
  }
};

/** Handle POST `/api/follow/:username/unfollow` — unfollow that account. */
export const postUnfollow: RestAPI<SafeUserInfo[], { username: string }> = async (req, res) => {
  const body = zAuthOnly.safeParse(req.body);
  if (!body.success) {
    res.status(400).send({ error: "Poorly-formed request" });
    return;
  }
  const user = await checkAuth(body.data.auth);
  if (!user) {
    res.status(403).send({ error: "Invalid credentials" });
    return;
  }
  try {
    res.send(await unfollowUser(user, req.params.username));
  } catch {
    res.status(404).send({ error: "User not found" });
  }
};

/** Handle POST `/api/follow/feed` — the authed user's home-page follower feed. */
export const postFeed: RestAPI<FollowFeed> = async (req, res) => {
  const body = zAuthOnly.safeParse(req.body);
  if (!body.success) {
    res.status(400).send({ error: "Poorly-formed request" });
    return;
  }
  const user = await checkAuth(body.data.auth);
  if (!user) {
    res.status(403).send({ error: "Invalid credentials" });
    return;
  }
  res.send(await getFollowerFeed(user));
};
