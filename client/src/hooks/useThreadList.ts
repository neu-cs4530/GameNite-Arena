import type { ErrorMsg, ThreadSummary } from "@gamenite/shared";
import { useEffect, useState } from "react";
import { threadList } from "../services/threadService.ts";

/**
 * Custom hook to get the list of all thread summaries
 * @param maxSummaries - the maximum number of summaries desired (default is all of them)
 * @returns A message to display to the user (Loading... or an error message), or a list
 */
export default function useThreadList(
  maxSummaries?: number,
): { message: string } | ThreadSummary[] {
  const [threads, setThreads] = useState<ThreadSummary[] | ErrorMsg | null>(null);

  useEffect(() => {
    threadList()
      .then(setThreads)
      .catch((err) => setThreads({ error: `${err}` }));
  }, [setThreads]);

  if (!threads) return { message: "Loading..." };
  if ("error" in threads) return { message: `Error: ${threads.error}` };
  if (threads.length === 0) return { message: "No threads found..." };
  if (maxSummaries) return threads.slice(0, maxSummaries);
  return threads;
}
