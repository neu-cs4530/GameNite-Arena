import { useCallback, useEffect, useRef, useState } from "react";
import { lsKeys } from "../util/consts.ts";

export interface ReplayPlaybackState {
  /** Current move index (0..totalMoves; the "0" position is pre-first-move). */
  currentMove: number;
  /** Total number of moves in the replay. */
  totalMoves: number;
  isPlaying: boolean;
  /** Speed in plays/sec (0.5 = half speed, 2 = double). */
  speed: number;
  /** When true, playback loops from end back to 0 once it finishes. */
  autoLoop: boolean;
  setCurrentMove: (n: number) => void;
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  next: () => void;
  prev: () => void;
  jump: (delta: number) => void;
  seekToStart: () => void;
  seekToEnd: () => void;
  setSpeed: (s: number) => void;
  toggleAutoLoop: () => void;
}

const VALID_SPEEDS = [0.5, 1, 1.5, 2, 4] as const;
export type ReplaySpeed = (typeof VALID_SPEEDS)[number];

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function readPersistedSpeed(): ReplaySpeed {
  if (typeof window === "undefined") return 1;
  const raw = window.localStorage.getItem(lsKeys.playbackSpeed);
  if (!raw) return 1;
  const n = parseFloat(raw);
  if (VALID_SPEEDS.includes(n as ReplaySpeed)) return n as ReplaySpeed;
  return 1;
}

function readPersistedAutoLoop(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(lsKeys.autoLoop) === "true";
}

/**
 * Drives the playback timeline. `totalMoves` is taken from the replay so
 * boundary clamping is correct.
 */
export default function useReplayPlayback(
  totalMoves: number,
  initialMove = 0,
): ReplayPlaybackState {
  const [currentMove, setCurrentMoveState] = useState(clamp(initialMove, 0, totalMoves));
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState<number>(readPersistedSpeed());
  const [autoLoop, setAutoLoop] = useState<boolean>(readPersistedAutoLoop());

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync currentMove if total changes (e.g., replay finishes loading).
  // We compare via a sentinel ref and only update when total actually shrinks
  // below the current value; doing this during render keeps the lint rule
  // against setState-in-effect happy.
  const [lastTotalMoves, setLastTotalMoves] = useState(totalMoves);
  if (lastTotalMoves !== totalMoves) {
    setLastTotalMoves(totalMoves);
    if (currentMove > totalMoves) {
      setCurrentMoveState(totalMoves);
    }
  }

  // Persist preferences.
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(lsKeys.playbackSpeed, String(speed));
    }
  }, [speed]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(lsKeys.autoLoop, String(autoLoop));
    }
  }, [autoLoop]);

  // Playback timer.
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!isPlaying) return;
    const intervalMs = 1_000 / speed;
    timerRef.current = setInterval(() => {
      setCurrentMoveState((cur) => {
        const next = cur + 1;
        if (next > totalMoves) {
          if (autoLoop) return 0;
          setIsPlaying(false);
          return totalMoves;
        }
        return next;
      });
    }, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [isPlaying, speed, totalMoves, autoLoop]);

  const setCurrentMove = useCallback(
    (n: number) => setCurrentMoveState(clamp(n, 0, totalMoves)),
    [totalMoves],
  );

  const play = useCallback(() => {
    setIsPlaying(true);
    // If we're at the end and play is pressed, restart.
    setCurrentMoveState((m) => (m >= totalMoves ? 0 : m));
  }, [totalMoves]);

  const pause = useCallback(() => setIsPlaying(false), []);

  const togglePlayPause = useCallback(() => {
    setIsPlaying((p) => {
      if (!p) {
        setCurrentMoveState((m) => (m >= totalMoves ? 0 : m));
      }
      return !p;
    });
  }, [totalMoves]);

  const next = useCallback(
    () =>
      setCurrentMoveState((m) => {
        if (m >= totalMoves) {
          // At the end: wrap when looping, otherwise hold at the end so the
          // button click is a no-op (the e2e suite asserts both behaviours).
          return autoLoop ? 0 : totalMoves;
        }
        return clamp(m + 1, 0, totalMoves);
      }),
    [totalMoves, autoLoop],
  );

  const prev = useCallback(
    () => setCurrentMoveState((m) => clamp(m - 1, 0, totalMoves)),
    [totalMoves],
  );

  const jump = useCallback(
    (delta: number) => setCurrentMoveState((m) => clamp(m + delta, 0, totalMoves)),
    [totalMoves],
  );

  const seekToStart = useCallback(() => setCurrentMoveState(0), []);
  const seekToEnd = useCallback(() => setCurrentMoveState(totalMoves), [totalMoves]);

  const setSpeed = useCallback((s: number) => {
    if (VALID_SPEEDS.includes(s as ReplaySpeed)) setSpeedState(s);
  }, []);

  const toggleAutoLoop = useCallback(() => setAutoLoop((v) => !v), []);

  return {
    currentMove,
    totalMoves,
    isPlaying,
    speed,
    autoLoop,
    setCurrentMove,
    play,
    pause,
    togglePlayPause,
    next,
    prev,
    jump,
    seekToStart,
    seekToEnd,
    setSpeed,
    toggleAutoLoop,
  };
}

export const PLAYBACK_SPEEDS = VALID_SPEEDS;
