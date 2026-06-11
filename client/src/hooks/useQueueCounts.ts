import { useEffect, useState } from "react";
import { fetchQueueCounts, type QueueCounts } from "../services/matchmakingService.ts";

/**
 * Live queue populations, polled while the caller is mounted. Both the
 * portal tiles and the queue page's "In queue" tile read from this, so the
 * two surfaces can never disagree about who is waiting.
 */
export default function useQueueCounts(pollMs = 3000): QueueCounts {
  const [counts, setCounts] = useState<QueueCounts>({});

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchQueueCounts()
        .then((next) => {
          if (!cancelled) setCounts(next);
        })
        .catch(() => {
          // keep the last good counts; the next poll retries
        });
    };
    load();
    const timer = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pollMs]);

  return counts;
}
