import { useEffect, useMemo, useReducer, useRef } from "react";
import { subscribeLiveProgress } from "../services/trainingService.ts";
import type { TrainingProgressEvent } from "../util/types.ts";

interface LiveProgressState {
  /** Every event received while the run was active (status === "running"). */
  events: TrainingProgressEvent[];
  /** Most recent event of any status — drives the metrics panel + log tail. */
  latest: TrainingProgressEvent | null;
  isLive: boolean;
  isComplete: boolean;
  hasFailed: boolean;
  /** Populated when a `failed` event arrives — sourced from event.message. */
  error?: string;
  /** Snapshot of final metrics, populated once status flips to "completed". */
  finalMeanReward?: number;
  finalWinRate?: number;
}

const initialState: LiveProgressState = {
  events: [],
  latest: null,
  isLive: false,
  isComplete: false,
  hasFailed: false,
};

type Action =
  | { type: "reset" }
  | { type: "connect" }
  | { type: "running"; event: TrainingProgressEvent }
  | { type: "completed"; event: TrainingProgressEvent }
  | { type: "failed"; event: TrainingProgressEvent };

function reducer(state: LiveProgressState, action: Action): LiveProgressState {
  switch (action.type) {
    case "reset":
      return { ...initialState };
    case "connect":
      return { ...state, isLive: true, isComplete: false, hasFailed: false, error: undefined };
    case "running":
      return {
        ...state,
        events: [...state.events, action.event],
        latest: action.event,
        isLive: true,
        isComplete: false,
      };
    case "completed":
      return {
        ...state,
        latest: action.event,
        isLive: false,
        isComplete: true,
        finalMeanReward: action.event.metrics?.meanReward,
        finalWinRate: action.event.metrics?.winRate,
      };
    case "failed":
      return {
        ...state,
        latest: action.event,
        isLive: false,
        isComplete: false,
        hasFailed: true,
        error: action.event.message ?? "Training run failed",
      };
  }
}

/**
 * Subscribes to the live training progress stream. Each event carries a
 * `status` discriminator; this hook routes by status, accumulates running
 * samples for the chart, and surfaces terminal state through `isComplete` /
 * `hasFailed`. The transport (mock today, socket.io tomorrow) is encapsulated
 * inside `subscribeLiveProgress`; this hook is shape-agnostic to the wire.
 */
export default function useLiveTrainingProgress(jobId: string | undefined): LiveProgressState & {
  disconnect: () => void;
} {
  const [state, dispatch] = useReducer(reducer, initialState);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!jobId) {
      dispatch({ type: "reset" });
      return;
    }
    dispatch({ type: "reset" });
    dispatch({ type: "connect" });
    const unsubscribe = subscribeLiveProgress(jobId, (event: TrainingProgressEvent) => {
      switch (event.status) {
        case "queued":
        case "running":
          dispatch({ type: "running", event });
          return;
        case "completed":
          dispatch({ type: "completed", event });
          return;
        case "failed":
          dispatch({ type: "failed", event });
          return;
      }
    });
    unsubRef.current = unsubscribe;
    return () => {
      unsubscribe();
      unsubRef.current = null;
    };
  }, [jobId]);

  const disconnect = useMemo(
    () => () => {
      unsubRef.current?.();
      unsubRef.current = null;
    },
    [],
  );

  return { ...state, disconnect };
}
