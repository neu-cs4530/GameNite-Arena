import "./InvalidMoveStreakIndicator.css";
import type { JSX } from "react";

interface InvalidMoveStreakIndicatorProps {
  streak: number;
  threshold?: number;
  testId?: string;
}

/** Visual indicator of consecutive-invalid-move count, capped at `threshold`. */
export default function InvalidMoveStreakIndicator({
  streak,
  threshold = 3,
  testId = "invalid-move-streak",
}: InvalidMoveStreakIndicatorProps): JSX.Element {
  const clamped = Math.min(streak, threshold);
  const isDanger = clamped >= threshold - 1; // 2 or 3 means near forfeit
  return (
    <span
      className={`ga-invalid-streak ${isDanger ? "ga-invalid-streak--danger" : ""}`.trim()}
      data-testid={testId}
      data-streak={streak}
      title={`${streak} of ${threshold} invalid moves before forfeit`}
      role="status"
      aria-label={`${streak} of ${threshold} invalid moves before forfeit`}
    >
      <span aria-hidden="true">⚠</span>
      <span className="ga-invalid-streak__pips" aria-hidden="true">
        {Array.from({ length: threshold }).map((_, i) => (
          <span
            key={i}
            className={`ga-invalid-streak__pip ${i < clamped ? "ga-invalid-streak__pip--filled" : ""}`.trim()}
          />
        ))}
      </span>
      <span>
        {streak} / {threshold}
      </span>
    </span>
  );
}
