import "./TrainingJobCard.css";
import type { JSX } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../ui/Card.tsx";
import Badge from "../ui/Badge.tsx";
import Button from "../ui/Button.tsx";
import TimeAgo from "../ui/TimeAgo.tsx";
import JobStatusPill from "./JobStatusPill.tsx";
import JobProgressChart from "./JobProgressChart.tsx";
import { trainerGameIcons, trainerGameNames } from "./trainerConsts.ts";
import type { TrainingJobSummary, TrainingJobDetail } from "../../util/types.ts";

interface TrainingJobCardProps {
  job: TrainingJobSummary | TrainingJobDetail;
  onClick?: () => void;
  /** Optional Download .pth handler — shown on completed jobs. */
  onDownload?: () => void;
  /** Optional Deploy handler — shown on completed jobs. */
  onDeploy?: () => void;
  /** Whether deploy should be disabled (cap hit). */
  deployDisabled?: boolean;
  /** Tooltip rendered on disabled deploy button. */
  deployDisabledReason?: string;
  /** Optional "Run again" handler. */
  onRunAgain?: () => void;
  /** Optional "Compare" handler — toggles selection. */
  onCompareToggle?: () => void;
  isComparing?: boolean;
  testId?: string;
}

function isDetail(job: TrainingJobSummary | TrainingJobDetail): job is TrainingJobDetail {
  return "episodesSeries" in job;
}

/** Card used in dashboard sections + jobs lists. */
export default function TrainingJobCard({
  job,
  onClick,
  onDownload,
  onDeploy,
  deployDisabled,
  deployDisabledReason,
  onRunAgain,
  onCompareToggle,
  isComparing,
  testId = "training-job-card",
}: TrainingJobCardProps): JSX.Element {
  const navigate = useNavigate();
  function go() {
    if (onClick) onClick();
    else void navigate(`/trainer/jobs/${job.id}`);
  }
  const progressPct = job.targetEpisodes
    ? Math.min(100, Math.round((job.progressEpisodes / job.targetEpisodes) * 100))
    : 0;
  const detail = isDetail(job) ? job : undefined;
  const isRunning = job.status === "running" || job.status === "queued";

  return (
    <Card
      className="ga-job-card"
      density="default"
      onClick={go}
      testId={testId}
      ariaLabel={`Training job for ${job.modelDisplayName}`}
    >
      <div className="ga-job-card__top">
        <div className="ga-job-card__title-row">
          <span aria-hidden="true">{trainerGameIcons[job.gameKey]}</span>
          <span className="ga-job-card__title" data-testid="training-job-card-title">
            {job.modelDisplayName}
          </span>
          <Badge variant="default" testId="training-job-card-game">
            {trainerGameNames[job.gameKey]}
          </Badge>
        </div>
        <JobStatusPill status={job.status} testId="training-job-card-status" />
      </div>

      <div className="ga-job-card__meta">
        <span data-testid="training-job-card-episodes">
          {job.progressEpisodes.toLocaleString()} / {job.targetEpisodes.toLocaleString()} episodes
        </span>
        <span>Mean reward: {job.currentMeanReward.toFixed(2)}</span>
        <span>Win rate: {(job.currentWinRate * 100).toFixed(0)}%</span>
      </div>

      {isRunning && (
        <div className="ga-job-card__progress" aria-label="Training progress">
          <div
            className="ga-job-card__progress-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPct}
            data-testid="training-job-card-progress"
          >
            <div className="ga-job-card__progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="ga-job-card__footer-info">{progressPct}%</span>
        </div>
      )}

      {detail && detail.episodesSeries.length > 1 && (
        <div className="ga-job-card__sparkline" data-testid="training-job-card-sparkline">
          <JobProgressChart
            variant="mini"
            episodes={detail.episodesSeries}
            meanReward={detail.meanRewardSeries}
            winRate={detail.winRateSeries}
            testId="training-job-card-mini-chart"
          />
        </div>
      )}

      <div className="ga-job-card__actions" onClick={(e) => e.stopPropagation()}>
        {job.status === "completed" && onDownload && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onDownload}
            data-testid="training-job-card-download"
          >
            Download .pth
          </Button>
        )}
        {job.status === "completed" && onDeploy && (
          <Button
            variant="primary"
            size="sm"
            onClick={onDeploy}
            disabled={deployDisabled}
            title={deployDisabled ? deployDisabledReason : undefined}
            data-testid="training-job-card-deploy"
          >
            Deploy
          </Button>
        )}
        {job.status === "completed" && onRunAgain && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRunAgain}
            data-testid="training-job-card-run-again"
          >
            Run again
          </Button>
        )}
        {job.status === "completed" && onCompareToggle && (
          <Button
            variant={isComparing ? "primary" : "ghost"}
            size="sm"
            onClick={onCompareToggle}
            data-testid="training-job-card-compare-toggle"
          >
            {isComparing ? "Comparing" : "Compare"}
          </Button>
        )}
        <span className="ga-job-card__footer-info">
          <TimeAgo date={job.createdAt} testId="training-job-card-time" />
        </span>
      </div>
    </Card>
  );
}
