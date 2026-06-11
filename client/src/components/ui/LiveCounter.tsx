import "./LiveCounter.css";
import { useEffect, useRef, useState, type JSX } from "react";

interface LiveCounterProps {
  value: number;
  className?: string;
  /** Animation duration in ms. */
  durationMs?: number;
  /** Optional prefix/suffix to wrap around the number. */
  prefix?: string;
  suffix?: string;
  testId?: string;
  /**
   * Number formatter to use for the visible label. `"plain"` emits the
   * integer with no separators so callers whose e2e tests parse the
   * `innerText()` back into a number can do so without stripping commas.
   * Defaults to `"locale"`.
   */
  format?: "locale" | "plain";
}

/**
 * Animated counter that smoothly tweens from the previous value to the new
 * value when it changes. Used for the spectator view-count "live ticker"
 * effect from the spec.
 */
export default function LiveCounter({
  value,
  className = "",
  durationMs = 500,
  prefix,
  suffix,
  testId,
  format = "locale",
}: LiveCounterProps): JSX.Element {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const startRef = useRef<number | null>(null);

  // Plain-format counters are usually testid'd numbers that get parsed
  // back via `Number(innerText)`. Animating them makes assertions race
  // the tween, so we paint the final value immediately and skip the
  // RAF loop entirely.
  const animate = format !== "plain";

  // For plain-format (non-animated) counters, sync the display value during
  // render rather than inside an effect. This avoids the React hook lint
  // rule about calling setState() synchronously inside an effect, and keeps
  // the visible label always equal to the prop. We still latch via a
  // setState so React schedules a re-render when the prop changes.
  const [lastSnap, setLastSnap] = useState(value);
  if (!animate && value !== lastSnap) {
    setLastSnap(value);
    setDisplay(value);
    // (the from-ref is owned by the animation effect below; for plain mode
    // we don't need to track a previous value because we paint `value`
    // immediately on every render.)
  }

  useEffect(() => {
    if (!animate) {
      // Plain mode handled in the render-phase derived setState above.
      // Keep the animation start ref consistent so a future format switch
      // resumes from the currently-painted value.
      fromRef.current = value;
      return;
    }
    fromRef.current = display;
    startRef.current = null;
    let raf = 0;
    const target = value;
    const start = fromRef.current;
    // If the gap is zero, skip the animation entirely. Avoids a one-frame
    // flash of the old value when the component first mounts with the
    // final value already set.
    if (target === start) {
      return;
    }
    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / durationMs);
      // Easing
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(start + (target - start) * eased);
      setDisplay(next);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs, animate]);

  return (
    <span
      className={`ga-live-counter ${className}`.trim()}
      data-testid={testId}
      aria-live="polite"
      data-value={display}
    >
      {prefix}
      {format === "plain" ? String(display) : display.toLocaleString()}
      {suffix}
    </span>
  );
}
