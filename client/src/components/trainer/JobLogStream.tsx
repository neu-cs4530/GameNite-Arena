import "./JobLogStream.css";
import type { JSX } from "react";
import type { TrainingProgressEvent } from "../../util/types.ts";

interface JobLogStreamProps {
  events: TrainingProgressEvent[];
  testId?: string;
}

/** Tiny scroll-back feed of progress events. */
export default function JobLogStream({
  events,
  testId = "job-log-stream",
}: JobLogStreamProps): JSX.Element {
  return (
    <div className="ga-job-log" data-testid={testId} role="log" aria-live="polite">
      {events.length === 0 && <span>Waiting for events...</span>}
      {events.slice(-20).map((e, i) => (
        <div key={`${e.epoch}-${i}`} className="ga-job-log__row">
          <strong>{e.epoch.toLocaleString()} ep</strong>
          <span>reward {e.metrics.meanReward.toFixed(3)}</span>
          <span>win {(e.metrics.winRate * 100).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}
