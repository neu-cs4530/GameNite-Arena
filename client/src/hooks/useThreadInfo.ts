import type { ErrorMsg, ThreadInfo } from "@gamenite/shared";
import { threadInfo } from "../services/threadService.ts";
import { useEffect, useState } from "react";

/**
 * Custom hook to get the information for a single thread and decide on an
 * appropriate message if that information is not available.
 * @param threadId
 * @returns an object containing
 * - `thread`: The requested thread, or a message explaining why it's not there
 * - `setThread`: A callback that can force a reload of the thread's information after adding a comment
 */
export default function useThreadInfo(threadId: string) {
  const [thread, setThread] = useState<ThreadInfo | ErrorMsg | null>(null);

  useEffect(() => {
    threadInfo(threadId)
      .then(setThread)
      .catch((err) => {
        setThread({ error: `${err}` });
      });
  }, [threadId]);

  if (!thread) return { threadInfo: { message: "Loading..." }, setThread };
  if ("error" in thread) return { threadInfo: { message: `Error: ${thread.error}` }, setThread };
  return {
    threadInfo: thread,
    setThread: (newThread: ThreadInfo) => setThread(newThread),
  };
}
