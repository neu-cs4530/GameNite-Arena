import { useCallback } from "react";
import type { GameKey } from "@gamenite/shared";
import useAsync, { type AsyncResult } from "./useAsync.ts";
import { fetchDailyPuzzle } from "../services/puzzleService.ts";
import type { DailyPuzzle } from "../services/puzzleMapper.ts";
import { PUZZLE_GAME_KEYS } from "../util/consts.ts";

/**
 * One puzzle game's slot for today. `puzzle: null` is the honest "the server
 * has no puzzle for this game today" answer (404); `status: "error"` is a
 * fetch/shape failure the caller can surface (or hide — Home) per-surface.
 */
export type DailyPuzzleSlot = { status: "ok"; puzzle: DailyPuzzle | null } | { status: "error" };

export type DailyPuzzleMap = Partial<Record<GameKey, DailyPuzzleSlot>>;

/**
 * Today's daily puzzle for every puzzle-enabled game, fetched with
 * `?for=<username>` so each slot carries the signed-in viewer's REAL
 * standing (`viewerAttempt`) — solved badges survive refreshes instead of
 * being session-only. Games fail independently: one game's outage can't
 * blank another's tile.
 *
 * Shared by the Puzzles page tiles, the Home daily-puzzle card, and the
 * games-portal tile badges so those surfaces can never disagree.
 *
 * @param forUsername - The signed-in viewer (from useLoginContext).
 * @returns Async map of gameKey → today's slot, with the usual refetch.
 */
export default function useDailyPuzzles(forUsername: string): AsyncResult<DailyPuzzleMap> {
  return useAsync(
    useCallback(async () => {
      const slots = await Promise.all(
        PUZZLE_GAME_KEYS.map(async (key): Promise<[GameKey, DailyPuzzleSlot]> => {
          try {
            return [key, { status: "ok", puzzle: await fetchDailyPuzzle(key, forUsername) }];
          } catch {
            return [key, { status: "error" }];
          }
        }),
      );
      return Object.fromEntries(slots);
    }, [forUsername]),
    [forUsername],
  );
}
