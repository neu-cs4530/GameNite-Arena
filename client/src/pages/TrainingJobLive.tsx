import "./TrainingJobLive.css";
import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Badge from "../components/ui/Badge.tsx";
import Button from "../components/ui/Button.tsx";
import Card from "../components/ui/Card.tsx";
import ErrorState from "../components/ui/ErrorState.tsx";
import LiveCounter from "../components/ui/LiveCounter.tsx";
import Section from "../components/ui/Section.tsx";
import Skeleton from "../components/ui/Skeleton.tsx";
import TimeAgo from "../components/ui/TimeAgo.tsx";
import {
  CheckpointsList,
  JobLogStream,
  JobMetricsPanel,
  JobProgressChart,
  JobStatusPill,
  LiveTrainingDot,
  NotifyOnCompleteToggle,
} from "../components/trainer/index.ts";
import { trainerGameNames } from "../components/trainer/trainerConsts.ts";
import useAuth from "../hooks/useAuth.ts";
import useJob from "../hooks/useJob.ts";
import useLiveTrainingProgress from "../hooks/useLiveTrainingProgress.ts";
import useLoginContext from "../hooks/useLoginContext.ts";
import {
  cancelJob,
  downloadArtifact,
  USING_REAL_TRAINING_API,
} from "../services/trainingService.ts";
import { createDeployment } from "../services/deploymentService.ts";
import { countActiveDeploymentsForGame } from "../__mocks__/training.ts";
import { DeploymentCapExceededError } from "../util/types.ts";

export default function TrainingJobLive(): JSX.Element {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { user } = useLoginContext();
  const auth = useAuth();
  const { job, loading, error, refetch } = useJob(jobId);
  // Real local-training sessions start "queued" until the trainer's first
  // report, so in real mode the page must already be subscribed at that
  // point or the run would stream into the void. Mock fixtures are pre-set
  // to "running", so mock behavior (and the e2e suite) is unchanged.
  const liveEligible =
    job !== null &&
    (job.status === "running" || (USING_REAL_TRAINING_API && job.status === "queued"));
  const live = useLiveTrainingProgress(liveEligible ? jobId : undefined);

  // The fetched record drives the status pill and the action bar, so re-read
  // it when the live stream reports a state the record does not know yet:
  // queued -> running on the first report, and any terminal transition.
  const liveStatus = live.latest?.status;
  useEffect(() => {
    if (live.isComplete || live.hasFailed) refetch();
  }, [live.isComplete, live.hasFailed, refetch]);
  useEffect(() => {
    if (job?.status === "queued" && liveStatus === "running") refetch();
  }, [job?.status, liveStatus, refetch]);
  const [cancelArmed, setCancelArmed] = useState(false);
  const [deployError, setDeployError] = useState<DeploymentCapExceededError | null>(null);
  const [autoDeployActive] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(`gnarena:autoDeploy:${jobId}`) === "true";
  });

  const handleResumeCheckpoint = useCallback(
    (ckptId: string) => {
      void navigate(`/trainer/new?fromCheckpoint=${ckptId}`);
    },
    [navigate],
  );

  const handleDownloadCheckpoint = useCallback(
    async (ckptId: string) => {
      if (!jobId) return;
      const blob = await downloadArtifact(jobId);
      triggerDownload(blob, `${ckptId}.pth`);
    },
    [jobId],
  );

  async function handleDownloadFinal() {
    if (!jobId) return;
    const blob = await downloadArtifact(jobId);
    triggerDownload(blob, `${jobId}.pth`);
  }

  async function handleCancel() {
    if (!jobId) return;
    await cancelJob(jobId, auth);
    refetch();
    setCancelArmed(false);
  }

  async function handleDeploy() {
    if (!job) return;
    try {
      const dep = await createDeployment(job.modelId, {
        displayName: `${job.modelDisplayName} live`,
      });
      void navigate(`/trainer?tab=deployments#${dep.id}`);
    } catch (err: unknown) {
      if (err instanceof DeploymentCapExceededError) {
        setDeployError(err);
      } else {
        throw err;
      }
    }
  }

  const slotUsed = useMemo(
    () => (job ? countActiveDeploymentsForGame(user.username, job.gameKey) : 0),
    [job, user.username],
  );
  const capFull = slotUsed >= 3;

  // Combined chart series: static fixture + accumulated live events.
  const liveSeries = useMemo(() => {
    if (!job) return { episodes: [], meanReward: [], winRate: [] };
    const baseE = job.episodesSeries.slice();
    const baseR = job.meanRewardSeries.slice();
    const baseW = job.winRateSeries.slice();
    for (const e of live.events) {
      if (e.epoch === undefined) continue;
      baseE.push(e.epoch);
      baseR.push(e.metrics?.meanReward ?? 0);
      baseW.push(e.metrics?.winRate ?? 0);
    }
    return { episodes: baseE, meanReward: baseR, winRate: baseW };
  }, [job, live.events]);

  if (loading) {
    return (
      <div className="ga-live-job" data-testid="training-job-live-loading">
        <header className="ga-live-job__hero">
          <Skeleton variant="rect" width={180} height={28} />
          <Skeleton variant="rect" width={120} height={20} />
        </header>
        <div className="ga-live-job__columns">
          <Skeleton variant="rect" width="100%" height={240} />
          <div>
            <Skeleton variant="rect" width="100%" height={120} />
            <Skeleton variant="rect" width="100%" height={120} />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ga-live-job" data-testid="training-job-live-error">
        <ErrorState
          title="Could not load training job"
          body={error.message}
          retry={() => refetch()}
        />
        <Button variant="secondary" onClick={() => refetch()} data-testid="training-job-live-retry">
          Retry
        </Button>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="ga-live-job">
        <ErrorState title="Job not found" />
        <Button variant="secondary" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const episodesNow = live.latest?.epoch ?? job.progressEpisodes;

  return (
    <div className="ga-live-job" data-testid="training-job-live">
      <header className="ga-live-job__hero" data-testid="training-job-header">
        <div>
          <h1>{job.modelDisplayName}</h1>
          <div className="ga-live-job__meta">
            <span className="ga-live-job__id">#{job.id}</span>
            {USING_REAL_TRAINING_API && (
              <Badge variant="warning" testId="real-training-mode-badge">
                Real training mode
              </Badge>
            )}
            <Badge variant="default" testId="training-job-game">
              {trainerGameNames[job.gameKey]}
            </Badge>
            <JobStatusPill status={job.status} />
            {job.status === "running" && <LiveTrainingDot active label="Live" />}
            <span data-testid="episode-progress">
              {episodesNow.toLocaleString()} / {job.targetEpisodes.toLocaleString()}
            </span>
            <span data-testid="elapsed-time">
              <TimeAgo date={job.createdAt} />
            </span>
            <span className="ga-live-job__views">
              <LiveCounter value={job.views} format="plain" testId="job-views-counter" />
              <span aria-hidden="true"> views</span>
            </span>
            {autoDeployActive && (
              <Badge variant="info" testId="auto-deploy-badge">
                Auto-deploy on completion
              </Badge>
            )}
          </div>
        </div>
      </header>

      {(deployError || (capFull && job.status === "completed")) && (
        <div className="ga-live-job__cap-error" role="alert" data-testid="slot-cap-exceeded-error">
          <div>
            <strong>
              You already have 3 active deployments in {trainerGameNames[job.gameKey]}.
            </strong>
            <p>Pause or retire one to free a slot.</p>
          </div>
          <Link to="/trainer?tab=deployments" data-testid="manage-deployments-link">
            Manage deployments
          </Link>
        </div>
      )}

      <div className="ga-live-job__columns">
        <div className="ga-live-job__col-left">
          <Card density="default" testId="training-job-chart-card">
            <JobProgressChart
              episodes={liveSeries.episodes}
              meanReward={liveSeries.meanReward}
              winRate={liveSeries.winRate}
              isLive={job.status === "running"}
              title="Training progress"
            />
            <JobLogStream events={live.events} />
            <div className="ga-live-job__event-count">
              Events received: <strong data-testid="event-count">{live.events.length}</strong>
            </div>
          </Card>
        </div>

        <div className="ga-live-job__col-right">
          <JobMetricsPanel job={job} liveLatest={live.latest} />
          <div data-testid="metric-episodes">
            Episodes: <strong>{episodesNow.toLocaleString()}</strong>
          </div>
          <div className="ga-live-job__projection" data-testid="stop-now-projection">
            If you stop now, projected final win rate:{" "}
            <strong>
              {((live.latest?.metrics?.winRate ?? job.currentWinRate) * 100).toFixed(1)}%
            </strong>
          </div>
          <NotifyOnCompleteToggleAdapter jobId={job.id} />
          <Section title="Checkpoints" testId="training-job-checkpoints">
            <CheckpointsList
              checkpoints={job.checkpoints ?? []}
              onResume={handleResumeCheckpoint}
              onDownload={(id) => void handleDownloadCheckpoint(id)}
            />
          </Section>
        </div>
      </div>

      <footer className="ga-live-job__action-bar" data-testid="training-job-action-bar">
        {(job.status === "running" || job.status === "queued") && !cancelArmed && (
          <Button
            variant="danger"
            onClick={() => setCancelArmed(true)}
            data-testid="training-job-cancel"
          >
            Cancel
          </Button>
        )}
        {(job.status === "running" || job.status === "queued") && cancelArmed && (
          <>
            <Button
              variant="danger"
              onClick={() => void handleCancel()}
              data-testid="training-job-confirm-cancel"
            >
              Confirm cancel
            </Button>
            <Button variant="ghost" onClick={() => setCancelArmed(false)}>
              Keep running
            </Button>
          </>
        )}
        {job.status === "completed" && job.hasArtifact && (
          <Button
            variant="secondary"
            onClick={() => void handleDownloadFinal()}
            data-testid="training-job-download"
          >
            Download .pth
          </Button>
        )}
        {job.status === "completed" && (
          <Button
            variant="primary"
            onClick={() => void handleDeploy()}
            disabled={capFull}
            title={capFull ? `Cap of 3 active deployments per game reached.` : undefined}
            data-testid="training-job-deploy"
          >
            Deploy
          </Button>
        )}
        {(job.status === "completed" || job.status === "failed" || job.status === "canceled") && (
          <Button
            variant="ghost"
            onClick={() => void navigate(`/trainer/new?fromJob=${job.id}`)}
            data-testid="training-job-run-again"
          >
            Run again with same config
          </Button>
        )}
        <Link
          to={`/trainer/compare?a=${job.id}`}
          className="ga-live-job__compare-link"
          data-testid="training-job-compare-link"
        >
          Compare runs
        </Link>
      </footer>
    </div>
  );
}

// localStorage-backed notify toggle that also persists into the shared
// "gnarena:notifyJobs" array key for the extra-features test.
function NotifyOnCompleteToggleAdapter({ jobId }: { jobId: string }): JSX.Element {
  // Local checkbox state mirrors both the per-job key and the array key.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const arrayKey = "gnarena:notifyJobs";
    function sync() {
      const present = window.localStorage.getItem(`gnarena:notifyOnComplete:${jobId}`) === "true";
      let arr: string[] = [];
      try {
        const raw = window.localStorage.getItem(arrayKey);
        arr = raw ? (JSON.parse(raw) as string[]) : [];
      } catch {
        arr = [];
      }
      const hasInArr = arr.includes(jobId);
      if (present && !hasInArr) {
        arr.push(jobId);
        window.localStorage.setItem(arrayKey, JSON.stringify(arr));
      } else if (!present && hasInArr) {
        arr = arr.filter((x) => x !== jobId);
        window.localStorage.setItem(arrayKey, JSON.stringify(arr));
      }
    }
    sync();
    const interval = setInterval(sync, 500);
    return () => clearInterval(interval);
  }, [jobId]);
  return <NotifyOnCompleteToggle jobId={jobId} />;
}

function triggerDownload(blob: Blob, filename: string) {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
