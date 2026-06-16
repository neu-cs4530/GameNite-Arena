import { AxiosError } from "axios";
import type {
  GameKey,
  PuzzleAttemptPayload,
  PuzzleAttemptResult,
  PuzzleHintResult,
  PuzzleView,
  TrainingAttemptPayload,
  TrainingAttemptResult,
  TrainingPackEntry,
  UserAuth,
} from "@gamenite/shared";
import { api } from "./api.ts";
import { mapPuzzleView, type DailyPuzzle } from "./puzzleMapper.ts";

/**
 * GET /api/puzzle/:gameKey — today's daily puzzle. The response never
 * contains the solution; hints and the post-attempt reveal are separate
 * endpoints.
 *
 * @param gameKey - Which game's daily puzzle to fetch.
 * @param forUsername - When provided (the signed-in viewer), the server adds
 *          `viewerAttempt` — that user's standing against today's puzzle —
 *          so solved badges are real and survive a refresh.
 * @returns The narrowed puzzle, or null when the server has no puzzle for
 *          today (404 — e.g. nothing in the match archive to mine yet).
 * @throws On network/server errors, or when the payload is malformed —
 *         callers surface those as a retryable ErrorState.
 */
export async function fetchDailyPuzzle(
  gameKey: GameKey,
  forUsername?: string,
): Promise<DailyPuzzle | null> {
  try {
    const query =
      forUsername === undefined || forUsername === ""
        ? ""
        : `?${new URLSearchParams({ for: forUsername }).toString()}`;
    const res = await api.get<PuzzleView>(`/api/puzzle/${gameKey}${query}`);
    const puzzle = mapPuzzleView(res.data);
    if (puzzle === null) throw new Error(`Malformed daily puzzle for ${gameKey}`);
    return puzzle;
  } catch (err) {
    if (err instanceof AxiosError && err.response?.status === 404) return null;
    throw err;
  }
}

/**
 * POST /api/puzzle/:gameKey/attempt — grade one attempt against the puzzle
 * pinned by `payload.date` (MUST echo the GET's date, so a session straddling
 * UTC midnight grades against the puzzle it actually rendered). The server
 * rates only the first unhinted attempt of the puzzle day; retries and
 * hinted attempts come back `rated: false` (practice). Hint usage is
 * entirely server-side — there is no hint count in the payload.
 *
 * @param gameKey - Which game's daily puzzle was attempted.
 * @param auth - The signed-in user's credentials (house body-auth pattern).
 * @param payload - The raw move, internally measured time, and pinned date.
 * @returns The server's verdict: success + rated flags, rating delta, new
 *          rating, effective streak, and the revealed solution.
 */
export async function submitPuzzleAttempt(
  gameKey: GameKey,
  auth: UserAuth,
  payload: PuzzleAttemptPayload,
): Promise<PuzzleAttemptResult> {
  const res = await api.post<PuzzleAttemptResult>(`/api/puzzle/${gameKey}/attempt`, {
    auth,
    payload,
  });
  return res.data;
}

/**
 * Have one of the caller's deployed models attempt today's puzzle. The model's
 * move is graded + rated exactly like a human attempt, so the result (rating,
 * streak, solution) counts toward the USER's puzzle Elo and shares the one
 * daily rated slot.
 */
export async function submitAiPuzzleAttempt(
  gameKey: GameKey,
  auth: UserAuth,
  deploymentId: string,
  date: string,
): Promise<PuzzleAttemptResult> {
  const res = await api.post<PuzzleAttemptResult>(`/api/puzzle/${gameKey}/attempt/ai`, {
    auth,
    payload: { deploymentId, date },
  });
  return res.data;
}

/**
 * POST /api/puzzle/:gameKey/hint — reveal the solution move for the puzzle
 * pinned by `date`. The server records the grant: from this moment every
 * attempt on this puzzle is practice (the hint IS the answer), so callers
 * must surface the forfeit honestly.
 *
 * @param gameKey - Which game's daily puzzle to get a hint for.
 * @param auth - The signed-in user's credentials (house body-auth pattern).
 * @param date - The puzzle date, echoed from the GET.
 * @returns The revealed move and (when available) its explanation.
 */
export async function requestPuzzleHint(
  gameKey: GameKey,
  auth: UserAuth,
  date: string,
): Promise<PuzzleHintResult> {
  const res = await api.post<PuzzleHintResult>(`/api/puzzle/${gameKey}/hint`, {
    auth,
    payload: { date },
  });
  return res.data;
}

/**
 * GET /api/puzzle/:gameKey/training — a batch of extra practice positions
 * mined from the match archive. Never contains a solution.
 *
 * @param gameKey - which game's training feed to fetch.
 * @param opts.limit - max entries to return, server defaults to 5.
 * @param opts.exclude - sourceMatchIds to skip, e.g. entries already shown.
 * @returns up to `limit` practice entries, most-recent-first.
 */
export async function fetchTrainingPack(
  gameKey: GameKey,
  opts: { limit?: number; exclude?: string[] } = {},
): Promise<TrainingPackEntry[]> {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.exclude && opts.exclude.length > 0) params.set("exclude", opts.exclude.join(","));

  const query = params.toString();
  const res = await api.get<TrainingPackEntry[]>(
    `/api/puzzle/${gameKey}/training${query ? `?${query}` : ""}`,
  );
  return res.data;
}

/**
 * POST /api/puzzle/:gameKey/training/attempt — grade one practice move
 * against the archived match `sourceMatchId`. Never touches rating or streak.
 *
 * @param gameKey - which game the practice position is from.
 * @param auth - the signed-in user's credentials (house body-auth pattern).
 * @param payload - the sourceMatchId and the raw move.
 * @returns success flag, solution move, and explanation.
 */
export async function submitTrainingAttempt(
  gameKey: GameKey,
  auth: UserAuth,
  payload: TrainingAttemptPayload,
): Promise<TrainingAttemptResult> {
  const res = await api.post<TrainingAttemptResult>(`/api/puzzle/${gameKey}/training/attempt`, {
    auth,
    payload,
  });
  return res.data;
}
