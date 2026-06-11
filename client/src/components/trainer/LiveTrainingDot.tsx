import "./LiveTrainingDot.css";
import type { JSX } from "react";

interface LiveTrainingDotProps {
  active: boolean;
  label?: string;
  testId?: string;
}

/** Pulsing dot that signals an open progress stream. */
export default function LiveTrainingDot({
  active,
  label,
  testId = "live-training-dot",
}: LiveTrainingDotProps): JSX.Element {
  return (
    <span
      className={`ga-live-dot ${active ? "ga-live-dot--active" : ""}`.trim()}
      data-testid={testId}
      aria-live="polite"
      role="status"
    >
      <span className="ga-live-dot__dot" aria-hidden="true" />
      <span>{label ?? (active ? "Live" : "Idle")}</span>
    </span>
  );
}
