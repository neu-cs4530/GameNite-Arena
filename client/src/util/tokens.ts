/**
 * TypeScript mirror of the design tokens declared in `client/src/main.css`.
 *
 * Components should prefer the CSS variable form (`var(--space-4)`) when at
 * all possible. Only reach for this map when you need a *numeric* value in
 * JS (e.g. for math against a DOMRect, like the dual-handle RangeSlider).
 */

/** Spacing scale in pixels. Keep in sync with `--space-*`. */
export const space = {
  s0: 0,
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s8: 32,
  s10: 40,
  s12: 48,
  s16: 64,
  s20: 80,
} as const;

/** Radii in pixels. */
export const radius = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

/** Motion durations in ms. */
export const duration = {
  fast: 120,
  base: 180,
  slow: 280,
} as const;

/** Mobile breakpoint in pixels — switches the replay viewer to a stacked layout. */
export const BREAKPOINT_MOBILE_PX = 768;

/** Default playback frame interval in ms used by `useReplayPlayback`. */
export const playbackIntervalsMs: Readonly<Record<number, number>> = {
  0.5: 2000,
  1: 1000,
  1.5: 666,
  2: 500,
  4: 250,
};
