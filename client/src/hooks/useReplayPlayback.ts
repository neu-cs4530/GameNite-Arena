import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
 *
 * `clip` optionally bounds playback to a sub-range of the timeline (used when
 * watching a saved highlight): navigation, autoplay, and the start/end seeks
 * all stay within `[clip.start, clip.end]` instead of the whole match.
 */
export default function useReplayPlayback(
  totalMoves: number,
  initialMove = 0,
  clip?: { start: number; end: number },
): ReplayPlaybackState {
  // Effective playback bounds — the clip range when given, else the full match.
  // Memoized on primitive start/end so the derived bounds stay stable across
  // renders (the clip object identity changes every render).
  const clipStart = clip?.start;
  const clipEnd = clip?.end;
  const lo = useMemo(
    () => (clipStart === undefined ? 0 : clamp(clipStart, 0, totalMoves)),
    [clipStart, totalMoves],
  );
  const hi = useMemo(
    () => (clipEnd === undefined ? totalMoves : clamp(clipEnd, lo, totalMoves)),
    [clipEnd, lo, totalMoves],
  );

  const [currentMove, setCurrentMoveState] = useState(clamp(initialMove, lo, hi));
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState<number>(readPersistedSpeed());
  const [autoLoop, setAutoLoop] = useState<boolean>(readPersistedAutoLoop());

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync currentMove when total changes (e.g., replay finishes loading).
  // Derived during render (sentinel-state pattern) to keep the lint rule
  // against setState-in-effect happy.
  //
  // Deep-link case: the hook usually mounts while the replay is still being
  // fetched (totalMoves = 0), which clamps a requested ?move=N down to 0.
  // Remember the original request and re-apply it once the move count
  // becomes known, so deep links survive the fetch latency.
  const [pendingInitialMove, setPendingInitialMove] = useState(initialMove);
  const [lastTotalMoves, setLastTotalMoves] = useState(totalMoves);
  if (lastTotalMoves !== totalMoves) {
    setLastTotalMoves(totalMoves);
    if (lastTotalMoves === 0 && totalMoves > 0 && pendingInitialMove > 0) {
      setCurrentMoveState(clamp(pendingInitialMove, lo, hi));
      setPendingInitialMove(0);
    } else if (currentMove > hi) {
      setCurrentMoveState(hi);
    } else if (currentMove < lo) {
      setCurrentMoveState(lo);
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
        if (next > hi) {
          if (autoLoop) return lo;
          setIsPlaying(false);
          return hi;
        }
        return next;
      });
    }, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [isPlaying, speed, hi, lo, autoLoop]);

  const setCurrentMove = useCallback(
    (n: number) => setCurrentMoveState(clamp(n, lo, hi)),
    [lo, hi],
  );

  const play = useCallback(() => {
    setIsPlaying(true);
    // If we're at the end and play is pressed, restart from the range start.
    setCurrentMoveState((m) => (m >= hi ? lo : m));
  }, [lo, hi]);

  const pause = useCallback(() => setIsPlaying(false), []);

  const togglePlayPause = useCallback(() => {
    setIsPlaying((p) => {
      if (!p) {
        setCurrentMoveState((m) => (m >= hi ? lo : m));
      }
      return !p;
    });
  }, [lo, hi]);

  const next = useCallback(
    () =>
      setCurrentMoveState((m) => {
        if (m >= hi) {
          // At the end: wrap when looping, otherwise hold at the end so the
          // button click is a no-op (the e2e suite asserts both behaviours).
          return autoLoop ? lo : hi;
        }
        return clamp(m + 1, lo, hi);
      }),
    [lo, hi, autoLoop],
  );

  const prev = useCallback(() => setCurrentMoveState((m) => clamp(m - 1, lo, hi)), [lo, hi]);

  const jump = useCallback(
    (delta: number) => setCurrentMoveState((m) => clamp(m + delta, lo, hi)),
    [lo, hi],
  );

  const seekToStart = useCallback(() => setCurrentMoveState(lo), [lo]);
  const seekToEnd = useCallback(() => setCurrentMoveState(hi), [hi]);

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
