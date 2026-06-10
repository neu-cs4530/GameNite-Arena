import { useEffect, useState } from "react";
import type { ReplayWatchersPayload } from "@gamenite/shared";
import useAuth from "./useAuth.ts";
import useLoginContext from "./useLoginContext.ts";

/**
 * Live watcher count for a replay, backed by a server-side socket presence
 * room: the count is the actual number of open viewers (including this one),
 * pushed on every join/leave/disconnect. Returns null until the first
 * broadcast arrives, so consumers can hide the badge instead of flashing a
 * fake number.
 */
export default function useLiveWatchers(matchId: string | undefined): number | null {
  const auth = useAuth();
  const { socket } = useLoginContext();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!matchId) return;
    const handleWatchers = (payload: ReplayWatchersPayload) => {
      if (payload.matchId === matchId) setCount(payload.count);
    };
    socket.on("replayWatchers", handleWatchers);
    socket.emit("replayWatch", { auth, payload: matchId });
    return () => {
      socket.off("replayWatchers", handleWatchers);
      socket.emit("replayLeave", { auth, payload: matchId });
      setCount(null);
    };
  }, [socket, auth, matchId]);

  return count;
}
