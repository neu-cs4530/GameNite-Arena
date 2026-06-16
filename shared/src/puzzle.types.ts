import { z } from "zod";
import { zGameKey, type GameKey } from "./game.types.ts";

/**
 * Wire types for the daily-puzzle surfaces (Story 1.7/1.8/1.12).
 *
 * The puzzle GET deliberately does NOT include the solution: shipping it to
 * an unauthenticated client made the rated economy gameable by curl. Hints
 * are served by a dedicated authed endpoint that records the grant
 * server-side, and the solution/explanation only ride back on the attempt
 * response (the verdict panel reveal).
 */

/** Glicko-2 rating triple as served over the wire. */
export interface GlickoRatingView {
  rating: number;
  rd: number;
  vol: number;
}

/** Daily puzzle streak as served over the wire. `current` is the EFFECTIVE
 * streak (already zeroed when the chain is broken) — clients render it raw. */
export interface PuzzleStreakView {
  current: number;
  best: number;
  lastSolvedAt?: string; // YYYY-MM-DD
}

/** What `GET /api/puzzle/:gameKey` serves. Never contains the solution. */
export interface PuzzleView {
  gameKey: GameKey;
  date: string; // YYYY-MM-DD — clients MUST echo this on attempts/hints
  position: unknown;
  sourceMatchId?: string;
  createdAt: string;
  /** Present when the request carried `?for=<username>`: that user's
   * standing against THIS puzzle. */
  viewerAttempt?: PuzzleViewerAttempt | null;
}

export interface PuzzleViewerAttempt {
  attempted: boolean;
  solved: boolean;
  rated: boolean;
}

/** YYYY-MM-DD (UTC puzzle day). */
export const zPuzzleDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Body payload for `POST /api/puzzle/:gameKey/attempt` (inside withAuth).
 * `date` pins the attempt to the puzzle the client actually rendered, so a
 * session straddling UTC midnight is graded against the right puzzle.
 * `hintsUsed` is intentionally absent — the server knows from the hint
 * grant log. */
export const zPuzzleAttemptPayload = z.object({
  move: z.unknown(),
  timeMs: z.number().int().min(0),
  date: zPuzzleDate,
});
export type PuzzleAttemptPayload = z.infer<typeof zPuzzleAttemptPayload>;

/** Body payload for `POST /api/puzzle/:gameKey/attempt/ai` (inside withAuth):
 * let one of the caller's deployed models attempt the daily puzzle in their
 * place. The model's move is graded and rated exactly like a human attempt —
 * it counts toward the USER's puzzle Elo and spends their one daily rated slot
 * (so it's "you OR your AI", not both). Returns a PuzzleAttemptResult. */
export const zPuzzleAiAttemptPayload = z.object({
  deploymentId: z.string().min(1),
  date: zPuzzleDate,
});
export type PuzzleAiAttemptPayload = z.infer<typeof zPuzzleAiAttemptPayload>;

/** Body payload for `POST /api/puzzle/:gameKey/hint` (inside withAuth). */
export const zPuzzleHintPayload = z.object({ date: zPuzzleDate });
export type PuzzleHintPayload = z.infer<typeof zPuzzleHintPayload>;
export const HINT_PENALTY = 5;

/** What the hint endpoint returns. Requesting a hint forfeits the rated
 * slot for this puzzle (the hint IS the answer). */
export interface PuzzleHintResult {
  hintMove: unknown;
  explanation?: string;
  eloDelta: number; // -HINT_PENALTY
  newRating: GlickoRatingView;
}

/** What `POST /api/puzzle/:gameKey/attempt` returns. The solution move and
 * explanation are revealed here — after the attempt — never on the GET. */
export interface PuzzleAttemptResult {
  success: boolean;
  rated: boolean;
  eloDelta: number;
  newRating: GlickoRatingView;
  streak: PuzzleStreakView;
  solutionMove: unknown;
  explanation?: string;
}

/** Scope for the puzzle leaderboard: one game, or all games blended. */
export const zPuzzleLeaderboardScope = z.union([zGameKey, z.literal("overall")]);
export type PuzzleLeaderboardScope = z.infer<typeof zPuzzleLeaderboardScope>;

export interface PuzzleLeaderboardEntry {
  rank: number;
  username: string;
  displayName: string;
  rating: number;
  provisional: boolean;
  attempts: number;
  solves: number;
  /** solves / attempts, 0..1, 0 when no attempts. */
  solveRate: number;
  streakCurrent: number;
  streakBest: number;
}

export interface PuzzleLeaderboardPage {
  scope: PuzzleLeaderboardScope;
  entries: PuzzleLeaderboardEntry[];
  page: number;
  pageSize: number;
  total: number;
}

/** One practice position from the training feed. No solution, same as PuzzleView. */
export interface TrainingPackEntry {
  gameKey: GameKey;
  position: unknown;
  sourceMatchId: string;
  createdAt: string;
}

/** Body payload for POST /api/puzzle/:gameKey/training/attempt. */
export const zTrainingAttemptPayload = z.object({
  sourceMatchId: z.string(),
  move: z.unknown(),
});
export type TrainingAttemptPayload = z.infer<typeof zTrainingAttemptPayload>;

/** Stateless grading result, practice attempts never touch rating or streak. */
export interface TrainingAttemptResult {
  success: boolean;
  solutionMove: unknown;
  explanation?: string;
}
