import { withAuth, zGameKey } from "@gamenite/shared";
import { z } from "zod";
import { checkAuth } from "../services/auth.service.ts";
import {
  getOrGenerateTodaysPuzzle,
  submitAttempt,
  type AttemptResult,
} from "../services/puzzle.service.ts";
import { type RestAPI } from "../types.ts";

const zAttemptBody = withAuth(
  z.object({
    move: z.unknown(),
    timeMs: z.number().int().nonnegative(),
    hintsUsed: z.number().int().nonnegative().default(0),
  }),
);

/**
 * Returns today's puzzle for the requested game, lazily generating it from
 * the match archive when the midnight cron hasn't produced one yet. 404 when
 * the game has no daily puzzle (not in PUZZLE_GAME_KEYS) or there is nothing
 * to mine a puzzle from.
 * @param req The request containing the gameKey route param.
 * @param res The response, either returning the PuzzleRecord or an error.
 */
export const getToday: RestAPI<unknown, { gameKey: string }> = async (req, res) => {
  const parsed = zGameKey.safeParse(req.params.gameKey);
  if (!parsed.success) {
    res.status(400).send({ error: "Unknown game" });
    return;
  }

  const puzzle = await getOrGenerateTodaysPuzzle(parsed.data);
  if (!puzzle) {
    res.status(404).send({ error: "No puzzle available for today" });
    return;
  }

  res.send(puzzle);
};

/**
 * Submits a move against today's puzzle. Grading is unconditional, but the
 * rated-attempt economy lives in the service: only the first unhinted attempt
 * of the UTC day moves the user's puzzle Glicko and streak — everything else
 * comes back `rated: false` with a zero eloDelta.
 * @param req The request containing auth, the move, elapsed time, and hints used.
 * @param res The response: success flag, rated flag, elo delta, new rating, and streak.
 */
export const postAttempt: RestAPI<AttemptResult, { gameKey: string }> = async (req, res) => {
  const gameKeyParsed = zGameKey.safeParse(req.params.gameKey);
  if (!gameKeyParsed.success) {
    res.status(400).send({ error: "Unknown game" });
    return;
  }

  const body = zAttemptBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).send({ error: "Poorly-formed request" });
    return;
  }

  const user = await checkAuth(body.data.auth);
  if (!user) {
    res.status(403).send({ error: "Invalid credentials" });
    return;
  }

  const { move, timeMs, hintsUsed } = body.data.payload;
  const result = await submitAttempt(gameKeyParsed.data, user.userId, { move, timeMs, hintsUsed });
  if (result === null) {
    res.status(404).send({ error: "No puzzle available for today" });
    return;
  }

  res.send(result);
};
