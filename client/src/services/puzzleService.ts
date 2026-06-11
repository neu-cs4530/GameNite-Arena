import { AxiosError } from "axios";
import type { GameKey, UserAuth } from "@gamenite/shared";
import { api } from "./api.ts";
import { mapPuzzleRecord, type DailyPuzzle, type PuzzleRecordWire } from "./puzzleMapper.ts";
import type { AttemptResultView } from "../util/puzzleAttempt.ts";

/**
 * GET /api/puzzle/:gameKey — today's daily puzzle.
 *
 * @param gameKey - Which game's daily puzzle to fetch.
 * @returns The narrowed puzzle, or null when the server has no puzzle for
 *          today (404 — e.g. nothing in the match archive to mine yet).
 * @throws On network/server errors, or when the payload is malformed —
 *         callers surface those as a retryable ErrorState.
 */
export async function fetchDailyPuzzle(gameKey: GameKey): Promise<DailyPuzzle | null> {
  try {
    const res = await api.get<PuzzleRecordWire>(`/api/puzzle/${gameKey}`);
    const puzzle = mapPuzzleRecord(res.data);
    if (puzzle === null) throw new Error(`Malformed daily puzzle for ${gameKey}`);
    return puzzle;
  } catch (err) {
    if (err instanceof AxiosError && err.response?.status === 404) return null;
    throw err;
  }
}

/**
 * POST /api/puzzle/:gameKey/attempt — grade one attempt against today's
 * puzzle. The server moves the user's Puzzle Glicko on EVERY attempt and
 * bumps the streak only on the first daily success.
 *
 * @param gameKey - Which game's daily puzzle was attempted.
 * @param auth - The signed-in user's credentials (house body-auth pattern).
 * @param payload - The raw move plus internally measured time and hint count.
 * @returns The server's verdict: success flag, rating delta, new rating, streak.
 */
export async function submitPuzzleAttempt(
  gameKey: GameKey,
  auth: UserAuth,
  payload: { move: unknown; timeMs: number; hintsUsed: number },
): Promise<AttemptResultView> {
  const res = await api.post<AttemptResultView>(`/api/puzzle/${gameKey}/attempt`, {
    auth,
    payload,
  });
  return res.data;
}
