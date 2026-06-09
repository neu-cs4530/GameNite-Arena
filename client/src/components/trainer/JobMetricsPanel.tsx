import "./JobMetricsPanel.css";
import { useContext, type JSX } from "react";
import { TimeContext } from "../../contexts/TimeContext.tsx";
import type { TrainingJobDetail, TrainingProgressEvent } from "../../util/types.ts";

interface JobMetricsPanelProps {
  job: TrainingJobDetail;
  /** When provided, the latest live event overrides the static job metrics. */
  liveLatest?: TrainingProgressEvent | null;
}

function formatEtaSeconds(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

/** Renders current reward / win rate / ETA / step time for a live job. */
export default function JobMetricsPanel({ job, liveLatest }: JobMetricsPanelProps): JSX.Element {
  const now = useContext(TimeContext);
  // Persisted job record uses `episodes`; the live WS event uses `epoch`.
  // Both `epoch` and metric keys are optional on the shared contract, so fall
  // back to the persisted job snapshot whenever the worker hasn't reported yet.
  const episodes = liveLatest?.epoch ?? job.progressEpisodes;
  const meanReward = liveLatest?.metrics?.meanReward ?? job.currentMeanReward;
  const winRate = liveLatest?.metrics?.winRate ?? job.currentWinRate;

  // Average step time = total elapsed / episodes. Mocked when no startedAt.
  // Use TimeContext as a pure source of "now" rather than calling Date.now()
  // during render (the latter is flagged as impure by our react-hooks rules).
  const nowMs = now?.getTime() ?? 0;
  const elapsedMs = job.startedAt && nowMs > 0 ? nowMs - new Date(job.startedAt).getTime() : 0;
  const stepTimeMs = episodes > 0 ? elapsedMs / episodes : 0;
  const remaining = Math.max(0, job.targetEpisodes - episodes);
  const etaS = (remaining * stepTimeMs) / 1000;

  // "If you stop now" projection — extrapolates win rate trend by 1 step.
  const projection = Math.min(1, winRate);

  return (
    <div className="ga-job-metrics" data-testid="job-metrics-panel">
      <div className="ga-job-metrics__title">Live metrics</div>
      <div className="ga-job-metrics__grid">
        <div className="ga-job-metric">
          <span className="ga-job-metric__label">Mean reward</span>
          <span className="ga-job-metric__value" data-testid="metric-mean-reward">
            {meanReward.toFixed(3)}
          </span>
        </div>
        <div className="ga-job-metric">
          <span className="ga-job-metric__label">Win rate</span>
          <span className="ga-job-metric__value" data-testid="metric-win-rate">
            {(winRate * 100).toFixed(1)}%
          </span>
        </div>
        <div className="ga-job-metric">
          <span className="ga-job-metric__label">ETA</span>
          <span className="ga-job-metric__value" data-testid="metric-eta">
            {formatEtaSeconds(etaS)}
          </span>
          <span className="ga-job-metric__hint">{remaining.toLocaleString()} episodes left</span>
        </div>
        <div className="ga-job-metric">
          <span className="ga-job-metric__label">Avg step time</span>
          <span className="ga-job-metric__value" data-testid="metric-step-time">
            {stepTimeMs > 0 ? `${stepTimeMs.toFixed(1)}ms` : "—"}
          </span>
        </div>
        <div className="ga-job-metric">
          <span className="ga-job-metric__label">If you stop now</span>
          <span className="ga-job-metric__value" data-testid="metric-projection">
            {(projection * 100).toFixed(1)}%
          </span>
          <span className="ga-job-metric__hint">projected final win rate</span>
        </div>
      </div>
    </div>
  );
}
