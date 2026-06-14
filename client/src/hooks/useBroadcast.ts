import { useEffect, useState } from "react";
import type {
  BroadcastEndedPayload,
  BroadcastInfo,
  BroadcastStateUpdatePayload,
  TaggedGameView,
} from "@gamenite/shared";
import useAuth from "./useAuth.ts";
import useLoginContext from "./useLoginContext.ts";
import { getBroadcast } from "../services/broadcastService.ts";

export interface UseBroadcastResult {
  /** The broadcast record (gameId, chatChannel, delaySec, status...). */
  info: BroadcastInfo | null;
  /** The latest delayed game view relayed to spectators, or null until the
   *  first update arrives (the broadcast feed has no initial snapshot). */
  view: TaggedGameView | null;
  /** True once the broadcast has ended. */
  ended: boolean;
  error: Error | null;
}

/**
 * Spectate a live broadcast: loads the broadcast record over REST, then joins
 * its delayed socket feed (`broadcastWatch`) and tracks the relayed
 * `broadcastStateUpdated` views plus `broadcastEnded`. Leaves the room on
 * unmount. The board stays null until the first relayed move — by design, the
 * broadcaster's delay means there is no immediate snapshot.
 */
export default function useBroadcast(broadcastId: string | undefined): UseBroadcastResult {
  const auth = useAuth();
  const { socket } = useLoginContext();
  const [info, setInfo] = useState<BroadcastInfo | null>(null);
  const [view, setView] = useState<TaggedGameView | null>(null);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!broadcastId) return;
    let active = true;
    getBroadcast(broadcastId)
      .then((b) => {
        if (!active) return;
        setError(null);
        setInfo(b);
        if (b.status === "ended") setEnded(true);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err : new Error(String(err)));
      });
    return () => {
      active = false;
    };
  }, [broadcastId]);

  useEffect(() => {
    if (!broadcastId) return;
    const handleState = (payload: BroadcastStateUpdatePayload) => {
      if (payload.broadcastId === broadcastId) setView(payload.view);
    };
    const handleEnded = (payload: BroadcastEndedPayload) => {
      if (payload.broadcastId === broadcastId) setEnded(true);
    };
    socket.on("broadcastStateUpdated", handleState);
    socket.on("broadcastEnded", handleEnded);
    socket.emit("broadcastWatch", { auth, payload: broadcastId });
    return () => {
      socket.off("broadcastStateUpdated", handleState);
      socket.off("broadcastEnded", handleEnded);
      socket.emit("broadcastLeave", { auth, payload: broadcastId });
    };
  }, [socket, auth, broadcastId]);

  return { info, view, ended, error };
}
