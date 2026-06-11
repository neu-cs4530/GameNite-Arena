/**
 * server/src/controllers/rating.controller.ts
 * =================================================
 * Read-only player rating views, mounted at /api/rating via ratingRouter()
 * (tests mount the identical router).
 *
 *   GET /api/rating/:gameKey/:username   one player's rating in one game
 *
 * Rating mutations happen only as a side effect of finished rated games
 * (rating.service.ts updateRatingsForGame).
 */

import express from "express";
import { zGameKey, type GameKey } from "@gamenite/shared";
import { type RestAPI } from "../types.ts";
import { getUserByUsername } from "../services/auth.service.ts";
import { getRatingSummary, type RatingSummary } from "../services/rating.service.ts";

/** The wire shape the matchmaking portal consumes. */
export type PlayerRatingView = RatingSummary & {
  gameKey: GameKey;
  username: string;
};

/** GET /api/rating/:gameKey/:username */
export const getByGameAndUsername: RestAPI<
  PlayerRatingView,
  { gameKey: string; username: string }
> = async (req, res) => {
  const gameKey = zGameKey.safeParse(req.params.gameKey);
  if (!gameKey.success) {
    res.status(400).send({ error: "Unknown game" });
    return;
  }

  const user = await getUserByUsername(req.params.username);
  if (!user) {
    res.status(404).send({ error: "User not found" });
    return;
  }

  const summary = await getRatingSummary(user.userId, gameKey.data);
  res.send({ gameKey: gameKey.data, username: user.username, ...summary });
};

export function ratingRouter(): express.Router {
  return express.Router().get("/:gameKey/:username", getByGameAndUsername);
}
