import { useEffect, useMemo, useReducer, useRef } from "react";
import { subscribeLiveProgress } from "../services/trainingService.ts";
import type { TrainingProgressEvent, TrainingStreamEvent } from "../util/types.ts";

interface LiveProgressState {
  /**
   * Accumulated "progress" samples for chart history. `started` and `complete`
   * carry the same shape but are tracked through `latest` / `isComplete` so the
   * chart doesn't double up on the zero point or repeat the final sample.
   */
  events: TrainingProgressEvent[];
  /** Most recent event of any kind — drives metrics panel and log stream tail. */
  latest: TrainingStreamEvent | null;
  isLive: boolean;
  isComplete: boolean;
  hasFailed: boolean;
  error?: string;
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
  | { type: "started"; event: TrainingStreamEvent }
  | { type: "progress"; event: TrainingProgressEvent }
  | { type: "complete"; event: TrainingStreamEvent; finalMeanReward: number; finalWinRate: number }
  | { type: "failed"; event: TrainingStreamEvent; error: string };

function reducer(state: LiveProgressState, action: Action): LiveProgressState {
  switch (action.type) {
    case "reset":
      return { ...initialState };
    case "connect":
      return { ...state, isLive: true, isComplete: false, hasFailed: false, error: undefined };
    case "started":
      return { ...state, latest: action.event, isLive: true, isComplete: false };
    case "progress":
      return {
        ...state,
        events: [...state.events, action.event],
        latest: action.event,
        isLive: true,
        isComplete: false,
      };
    case "complete":
      return {
        ...state,
        latest: action.event,
        isLive: false,
        isComplete: true,
        finalMeanReward: action.finalMeanReward,
        finalWinRate: action.finalWinRate,
      };
    case "failed":
      return {
        ...state,
        latest: action.event,
        isLive: false,
        isComplete: false,
        hasFailed: true,
        error: action.error,
      };
  }
}

/**
 * Subscribes to the live progress WebSocket for the given job. Accumulates
 * progress events, surfaces the most recent of any kind through `latest`, and
 * flips `isComplete` / `hasFailed` on terminal lifecycle events.
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
    const unsubscribe = subscribeLiveProgress(jobId, (event: TrainingStreamEvent) => {
      switch (event.kind) {
        case "started":
          dispatch({ type: "started", event });
          return;
        case "progress":
          dispatch({ type: "progress", event });
          return;
        case "complete":
          dispatch({
            type: "complete",
            event,
            finalMeanReward: event.metrics.meanReward,
            finalWinRate: event.metrics.winRate,
          });
          return;
        case "failed":
          dispatch({ type: "failed", event, error: event.error });
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
