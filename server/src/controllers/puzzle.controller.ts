import {
  withAuth,
  zGameKey,
  zPuzzleAttemptPayload,
  zPuzzleHintPayload,
  zPuzzleLeaderboardScope,
  zTrainingAttemptPayload,
  type PuzzleAttemptResult,
  type PuzzleHintResult,
  type PuzzleLeaderboardPage,
  type PuzzleView,
  type TrainingAttemptResult,
  type TrainingPackEntry,
} from "@gamenite/shared";
import { z } from "zod";
import { checkAuth } from "../services/auth.service.ts";
import {
  getOrGenerateTodaysPuzzle,
  getTrainingPack,
  getViewerAttempt,
  grantHint,
  submitAttempt,
  submitTrainingAttempt,
} from "../services/puzzle.service.ts";
import { getPuzzleLeaderboard } from "../services/puzzleLeaderboard.service.ts";
import { type RestAPI } from "../types.ts";

// the shared payloads are the single source of truth for attempt/hint bodies
const zAttemptBody = withAuth(zPuzzleAttemptPayload);
const zHintBody = withAuth(zPuzzleHintPayload);
const zTrainingBody = withAuth(zTrainingAttemptPayload);

// limit defaults to 5, exclude is a comma-separated list of match ids
const zTrainingQuery = z.object({
  limit: z.coerce.number().int().positive().max(20).default(5),
  exclude: z.string().optional(),
});

// `?game=` per the design doc, with `?scope=` accepted as an alias
const zLeaderboardQuery = z.object({
  game: zPuzzleLeaderboardScope.optional(),
  scope: zPuzzleLeaderboardScope.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

/**
 * Returns today's puzzle for the requested game as a PuzzleView, lazily
 * generating it from the match archive when the midnight cron hasn't
 * produced one yet. The view NEVER contains the solution — hints are a
 * separate authed endpoint and the solution only rides the attempt response.
 *
 * 404 when the game key is unknown, has no daily puzzle (not in
 * PUZZLE_GAME_KEYS), or there is nothing to mine a puzzle from.
 *
 * Query params:
 *   for - optional username; adds `viewerAttempt` (that user's standing
 *         against this puzzle), or null when no such user exists.
 *
 * @param req The request containing the gameKey route param.
 * @param res The response, either returning the PuzzleView or an error.
 */
export const getToday: RestAPI<PuzzleView, { gameKey: string }> = async (req, res) => {
  const parsed = zGameKey.safeParse(req.params.gameKey);
  if (!parsed.success) {
    res.status(404).send({ error: "Unknown game" });
    return;
  }

  const puzzle = await getOrGenerateTodaysPuzzle(parsed.data);
  if (!puzzle) {
    res.status(404).send({ error: "No puzzle available for today" });
    return;
  }

  // built field by field so the stored solution can never leak into the wire
  const view: PuzzleView = {
    gameKey: puzzle.gameKey,
    date: puzzle.date,
    position: puzzle.position,
    createdAt: puzzle.createdAt,
  };
  if (puzzle.sourceMatchId !== undefined) view.sourceMatchId = puzzle.sourceMatchId;

  const forUser = req.query.for;
  if (typeof forUser === "string" && forUser.length > 0) {
    view.viewerAttempt = await getViewerAttempt(forUser, `${puzzle.gameKey}:${puzzle.date}`);
  }

  res.send(view);
};

/**
 * Submits a move against the daily puzzle pinned by the payload's `date`
 * (the day the client actually rendered — sessions straddling UTC midnight
 * grade against the right puzzle). Grading is unconditional; the rated
 * economy and the decoupled streak live in the service. Hint state is
 * server-side: there is no client-supplied hint count.
 *
 * @param req The request containing auth, the move, elapsed time, and the
 *            pinned puzzle date.
 * @param res The response: success/rated flags, elo delta, new per-game
 *            rating, effective streak, and the solution reveal.
 */
export const postAttempt: RestAPI<PuzzleAttemptResult, { gameKey: string }> = async (req, res) => {
  const gameKeyParsed = zGameKey.safeParse(req.params.gameKey);
  if (!gameKeyParsed.success) {
    res.status(404).send({ error: "Unknown game" });
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

  const { move, timeMs, date } = body.data.payload;
  const result = await submitAttempt(user.userId, gameKeyParsed.data, { move, timeMs, date });
  if (result === null) {
    res.status(404).send({ error: "No puzzle available for that date" });
    return;
  }

  res.send(result);
};

/**
 * POST /api/puzzle/:gameKey/hint — reveals the solution move for the puzzle
 * pinned by the payload's `date` and records the grant server-side. From
 * this point every attempt by this user on this puzzle is practice (the
 * hint IS the answer).
 *
 * @param req The request containing auth and the pinned puzzle date.
 * @param res The response: the hint move and explanation, or an error.
 */
export const postHint: RestAPI<PuzzleHintResult, { gameKey: string }> = async (req, res) => {
  const gameKeyParsed = zGameKey.safeParse(req.params.gameKey);
  if (!gameKeyParsed.success) {
    res.status(404).send({ error: "Unknown game" });
    return;
  }

  const body = zHintBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).send({ error: "Poorly-formed request" });
    return;
  }

  const user = await checkAuth(body.data.auth);
  if (!user) {
    res.status(403).send({ error: "Invalid credentials" });
    return;
  }

  const result = await grantHint(user.userId, gameKeyParsed.data, body.data.payload.date);
  if (result === null) {
    res.status(404).send({ error: "No puzzle available for that date" });
    return;
  }

  res.send(result);
};

/**
 * GET /api/puzzle/leaderboard — ranked puzzle standings.
 *
 * Query params:
 *   game  - a GameKey or "overall" (default "overall"); `scope` is accepted
 *           as an alias
 *   page  - 1-indexed page number (default 1)
 *   limit - entries per page, max 100 (default 50)
 *
 * @param req The request carrying the query params above.
 * @param res The response: a paginated PuzzleLeaderboardPage.
 */
export const getLeaderboard: RestAPI<PuzzleLeaderboardPage> = async (req, res) => {
  const query = zLeaderboardQuery.safeParse(req.query);
  if (!query.success) {
    res.status(400).send({ error: "Invalid query parameters" });
    return;
  }

  const result = await getPuzzleLeaderboard({
    scope: query.data.scope ?? query.data.game ?? "overall",
    page: query.data.page,
    limit: query.data.limit,
  });

  res.send(result);
};

/**
 * GET /api/puzzle/:gameKey/training — extra unrated practice positions mined
 * from the match archive. Never contains a solution, same as getToday.
 * Unknown game keys just get an empty array back.
 *
 * @param req The request containing the gameKey route param and the
 *            limit/exclude query params.
 * @param res The response: an array of TrainingPackEntry.
 */
export const getTraining: RestAPI<TrainingPackEntry[], { gameKey: string }> = async (req, res) => {
  const gameKeyParsed = zGameKey.safeParse(req.params.gameKey);
  if (!gameKeyParsed.success) {
    res.send([]);
    return;
  }

  const query = zTrainingQuery.safeParse(req.query);
  if (!query.success) {
    res.status(400).send({ error: "Invalid query parameters" });
    return;
  }

  const exclude = query.data.exclude?.split(",").filter((id) => id.length > 0);
  const entries = await getTrainingPack(gameKeyParsed.data, { limit: query.data.limit, exclude });
  res.send(entries);
};

/**
 * POST /api/puzzle/:gameKey/training/attempt — grades a practice move against
 * the archived match `sourceMatchId`. Always practice: no rating or streak
 * change, no attempt log entry.
 *
 * @param req The request containing auth, sourceMatchId, and the move.
 * @param res The response: success flag, solution move, and explanation.
 */
export const postTrainingAttempt: RestAPI<TrainingAttemptResult, { gameKey: string }> = async (
  req,
  res,
) => {
  const gameKeyParsed = zGameKey.safeParse(req.params.gameKey);
  if (!gameKeyParsed.success) {
    res.status(404).send({ error: "Unknown game" });
    return;
  }

  const body = zTrainingBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).send({ error: "Poorly-formed request" });
    return;
  }

  const user = await checkAuth(body.data.auth);
  if (!user) {
    res.status(403).send({ error: "Invalid credentials" });
    return;
  }

  const { sourceMatchId, move } = body.data.payload;
  const result = await submitTrainingAttempt(gameKeyParsed.data, sourceMatchId, move);
  if (result === null) {
    res.status(404).send({ error: "No practice position for that match" });
    return;
  }

  res.send(result);
};
