import "./JobRow.css";
import { useState, type JSX } from "react";
import { Link } from "react-router-dom";
import Badge from "../ui/Badge.tsx";
import Button from "../ui/Button.tsx";
import CopyField from "../ui/CopyField.tsx";
import Disclosure from "../ui/Disclosure.tsx";
import TimeAgo from "../ui/TimeAgo.tsx";
import JobStatusPill from "./JobStatusPill.tsx";
import { trainerGameNames } from "./trainerConsts.ts";
import { rawSessionView } from "../../services/trainingMapper.ts";
import type { TrainingJobDetail } from "../../util/types.ts";

/** Queued sessions older than this read as stalled — connect or cancel. */
const STALLED_AFTER_MS = 60 * 60 * 1000;

interface JobRowProps {
  job: TrainingJobDetail;
  expanded: boolean;
  onToggle: (open: boolean) => void;
  /** Cancel a queued/running session (auth handled by the caller). */
  onCancel?: (jobId: string) => Promise<void>;
  highlight?: boolean;
}

/**
 * One training run at tier 1: status, name, game, the single most useful
 * number for its state — and a truncated failure reason right on the row,
 * because "Failed" alone answers nothing. Expanding is tier 2: config,
 * full error, artifact integrity, ids. Raw session data is tier 3, nested.
 */
export default function JobRow({
  job,
  expanded,
  onToggle,
  onCancel,
  highlight,
}: JobRowProps): JSX.Element {
  const [rawOpen, setRawOpen] = useState(false);
  const [canceling, setCanceling] = useState(false);
  // Captured once on mount: "stalled" is an hour-scale judgement, not a timer.
  const [mountedAt] = useState(() => Date.now());

  const stalled =
    job.status === "queued" && mountedAt - Date.parse(job.createdAt) > STALLED_AFTER_MS;
  const progressFraction =
    job.targetEpisodes > 0 ? Math.min(1, job.progressEpisodes / job.targetEpisodes) : 0;

  async function handleCancel() {
    if (!onCancel) return;
    setCanceling(true);
    try {
      await onCancel(job.id);
    } finally {
      setCanceling(false);
    }
  }

  const summary = (
    <span className="ga-job-row__summary">
      <JobStatusPill status={job.status} />
      <Link
        to={`/trainer/jobs/${job.id}`}
        className="ga-job-row__name"
        onClick={(e) => e.stopPropagation()}
        data-testid="job-row-name"
      >
        {job.modelDisplayName}
      </Link>
      <Badge variant="default">{trainerGameNames[job.gameKey]}</Badge>
      {job.status === "running" && (
        <span className="ga-job-row__progress" data-testid="job-row-progress">
          <span className="ga-job-row__progress-track" aria-hidden="true">
            <span
              className="ga-job-row__progress-fill"
              style={{ width: `${Math.round(progressFraction * 100)}%` }}
            />
          </span>
          {job.progressEpisodes.toLocaleString()} / {job.targetEpisodes.toLocaleString()}
        </span>
      )}
      {job.status === "completed" && (
        <span className="ga-job-row__stat" data-testid="job-row-winrate">
          win rate {(job.currentWinRate * 100).toFixed(0)}%
        </span>
      )}
      {job.status === "failed" && job.error && (
        <span className="ga-job-row__error-line" data-testid="job-row-error" title={job.error}>
          {job.error}
        </span>
      )}
      {job.status === "queued" && (
        <span className="ga-job-row__stat" data-testid="job-row-waiting">
          {stalled ? "stalled — connect your trainer or cancel" : "waiting for your trainer"}
        </span>
      )}
    </span>
  );

  const meta = (
    <>
      {(job.status === "queued" || job.status === "running") && onCancel && (
        <Button
          variant="ghost"
          size="sm"
          loading={canceling}
          onClick={() => void handleCancel()}
          data-testid="job-row-cancel"
        >
          Cancel
        </Button>
      )}
      <TimeAgo date={job.createdAt} />
    </>
  );

  return (
    <Disclosure
      level="row"
      summary={summary}
      meta={meta}
      open={expanded}
      onToggle={onToggle}
      id={`job-${job.id}`}
      testId="job-row"
      className={highlight ? "ga-disclosure--highlight" : undefined}
    >
      <div className="ga-job-row__details" data-testid="job-row-details">
        <dl className="ga-job-row__grid">
          <div>
            <dt>Episodes</dt>
            <dd>{job.hyperparameters.episodes.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Learning rate</dt>
            <dd>{job.hyperparameters.learningRate}</dd>
          </div>
          {job.status !== "queued" && (
            <div>
              <dt>Progress</dt>
              <dd>
                {job.progressEpisodes.toLocaleString()} episodes · mean reward{" "}
                {job.currentMeanReward.toFixed(3)} · win rate{" "}
                {(job.currentWinRate * 100).toFixed(1)}%
              </dd>
            </div>
          )}
          {job.completedAt && (
            <div>
              <dt>Finished</dt>
              <dd>
                <TimeAgo date={job.completedAt} />
              </dd>
            </div>
          )}
          {job.hasArtifact && job.artifactMeta && (
            <div>
              <dt>Artifact</dt>
              <dd data-testid="job-row-artifact">
                {(job.artifactMeta.bytes / 1024).toFixed(1)} KiB · sha256{" "}
                <code>{job.artifactMeta.sha256.slice(0, 12)}…</code>
              </dd>
            </div>
          )}
        </dl>
        {job.status === "failed" && job.error && (
          <p className="ga-job-row__error-full" data-testid="job-row-error-full">
            {job.error}
          </p>
        )}
        {job.hyperparameters.extraConfig && (
          <pre className="ga-job-row__raw">
            {JSON.stringify(job.hyperparameters.extraConfig, null, 2)}
          </pre>
        )}
        <CopyField label="Job id" value={job.id} testId="job-row-id" />
        <Disclosure
          level="inline"
          summary="Raw session data"
          open={rawOpen}
          onToggle={setRawOpen}
          testId="job-row-raw"
        >
          <pre className="ga-job-row__raw">{JSON.stringify(rawSessionView(job), null, 2)}</pre>
        </Disclosure>
      </div>
    </Disclosure>
  );
}
