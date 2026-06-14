import "./LiveDot.css";
import type { JSX } from "react";

interface LiveDotProps {
  /** Text beside the dot. Defaults to "LIVE". */
  label?: string;
  testId?: string;
}

/**
 * A small red pulsing "LIVE" badge — the broadcast/recording indicator used on
 * live-game cards, the live viewer header, and the profile "currently live"
 * affordance.
 */
export default function LiveDot({ label = "LIVE", testId }: LiveDotProps): JSX.Element {
  return (
    <span className="ga-livedot" data-testid={testId} role="status" aria-live="polite">
      <span className="ga-livedot__dot" aria-hidden="true" />
      {label}
    </span>
  );
}
