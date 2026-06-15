import { useCallback, useMemo, useState } from "react";
import type { GameKey, TrainingPackEntry } from "@gamenite/shared";
import useAsync from "./useAsync.ts";
import { fetchTrainingPack } from "../services/puzzleService.ts";
import { mapTrainingPackEntry, type TrainingPracticeItem } from "../services/puzzleMapper.ts";

const PAGE_SIZE = 5;

function mapEntries(entries: TrainingPackEntry[]): TrainingPracticeItem[] {
  return entries
    .map(mapTrainingPackEntry)
    .filter((item): item is TrainingPracticeItem => item !== null);
}

export interface UseTrainingPack {
  status: "pending" | "ok" | "error";
  items: TrainingPracticeItem[];
  loadMore: () => void;
  loadingMore: boolean;
}

/**
 * One game's practice feed, fetched in small batches with a "load more" button.
 *
 * @param gameKey - which game's training feed to load.
 * @returns the practice items loaded so far, plus a loadMore callback.
 */
export default function useTrainingPack(gameKey: GameKey): UseTrainingPack {
  const {
    data: firstBatch,
    loading,
    error,
  } = useAsync(
    useCallback(() => fetchTrainingPack(gameKey, { limit: PAGE_SIZE }), [gameKey]),
    [gameKey],
  );

  const [extraItems, setExtraItems] = useState<TrainingPracticeItem[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastGameKey, setLastGameKey] = useState(gameKey);

  // reset the load-more items when the game changes, during render so we
  // don't setState inside an effect
  if (lastGameKey !== gameKey) {
    setLastGameKey(gameKey);
    setExtraItems([]);
  }

  const items = useMemo(
    () => [...mapEntries(firstBatch ?? []), ...extraItems],
    [firstBatch, extraItems],
  );

  const loadMore = useCallback(() => {
    setLoadingMore(true);
    const exclude = items.map((item) => item.sourceMatchId);
    fetchTrainingPack(gameKey, { limit: PAGE_SIZE, exclude })
      .then((entries) => setExtraItems((prev) => [...prev, ...mapEntries(entries)]))
      .catch(() => {
        // keep the existing items, the button stays clickable to retry
      })
      .finally(() => setLoadingMore(false));
  }, [gameKey, items]);

  const status: "pending" | "ok" | "error" = error ? "error" : loading ? "pending" : "ok";

  return { status, items, loadMore, loadingMore };
}
