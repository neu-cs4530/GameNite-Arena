import { withAuth, zGameKey } from "@gamenite/shared";
import { z } from "zod";
import { checkAuth } from "../services/auth.service.ts";
import {
  updateRating,
  DEFAULT_RATING,
  DEFAULT_RD,
  type Glicko2GameResult,
} from "../services/glicko2.service.ts";
import { getOrGenerateTodaysPuzzle } from "../services/puzzle.service.ts";
import { PuzzleAttemptRepo, PuzzleRepo, UserRepo } from "../repository.ts";
import { dailyPuzzleKey, type GlickoRating, type PuzzleStreak } from "../models.ts";
import { type RestAPI } from "../types.ts";

// puzzle has no dynamic rating so we treat it as a fresh average player (1500 rating, 350 rd)
const puzzleOpponent = { opponentRating: DEFAULT_RATING, opponentRd: DEFAULT_RD };

const zAttemptBody = withAuth(
  z.object({
    move: z.unknown(),
    timeMs: z.number().int().nonnegative(),
    hintsUsed: z.number().int().nonnegative().default(0),
  }),
);

export interface AttemptResult {
  success: boolean;
  eloDelta: number;
  newRating: GlickoRating;
  streak: PuzzleStreak;
}

/**
 * Returns today's puzzle for the requested game, lazily generating it from
 * the match archive when the midnight cron hasn't produced one yet. 404 only
 * when there is genuinely nothing to mine a puzzle from.
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
 * Submits a move against today's puzzle and updates the user's puzzle Elo and streak.
 * @param req The request containing auth, the move, elapsed time, and hints used.
 * @param res The response, returning success flag, elo delta, new rating, and streak.
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

  const gameKey = gameKeyParsed.data;
  const { move, timeMs, hintsUsed } = body.data.payload;

  const puzzleKey = dailyPuzzleKey({ gameKey, date: new Date() });
  const puzzle = await PuzzleRepo.find(puzzleKey);
  if (!puzzle) {
    res.status(404).send({ error: "No puzzle available for today" });
    return;
  }

  // check submitted move against the first solution move
  const success = JSON.stringify(move) === JSON.stringify(puzzle.solution.moves[0]);

  const userRecord = await UserRepo.get(user.userId);
  const oldRating = userRecord.puzzleRating;

  const result: Glicko2GameResult = { ...puzzleOpponent, score: success ? 1.0 : 0.0 };
  const updated = updateRating(
    { rating: oldRating.rating, rd: oldRating.rd, volatility: oldRating.vol },
    [result],
  );
  const newRating: GlickoRating = {
    rating: updated.rating,
    rd: updated.rd,
    vol: updated.volatility,
  };
  const eloDelta = Math.round(newRating.rating - oldRating.rating);

  // streak only updates on the first successful solve of each day
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const oldStreak = userRecord.puzzleStreak;
  let newStreak = oldStreak;

  if (success && oldStreak.lastSolvedAt !== today) {
    const current = oldStreak.lastSolvedAt === yesterday ? oldStreak.current + 1 : 1;
    newStreak = { current, best: Math.max(current, oldStreak.best), lastSolvedAt: today };
  }

  await UserRepo.set(user.userId, {
    ...userRecord,
    puzzleRating: newRating,
    puzzleStreak: newStreak,
  });

  await PuzzleAttemptRepo.add({
    puzzleId: puzzleKey,
    attemptedBy: { id: user.userId, type: "human" },
    success,
    timeMs,
    hintsUsed,
    eloDelta,
    createdAt: new Date().toISOString(),
  });

  res.send({ success, eloDelta, newRating, streak: newStreak });
};
