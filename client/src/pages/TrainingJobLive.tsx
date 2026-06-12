import "./TrainingJobLive.css";
import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Badge from "../components/ui/Badge.tsx";
import Button from "../components/ui/Button.tsx";
import CopyField from "../components/ui/CopyField.tsx";
import Disclosure from "../components/ui/Disclosure.tsx";
import ErrorState from "../components/ui/ErrorState.tsx";
import Skeleton from "../components/ui/Skeleton.tsx";
import TimeAgo from "../components/ui/TimeAgo.tsx";
import {
  ConnectTrainerCard,
  JobLogStream,
  JobProgressChart,
  JobStatusPill,
  LiveTrainingDot,
} from "../components/trainer/index.ts";
import { trainerGameNames } from "../components/trainer/trainerConsts.ts";
import useAuth from "../hooks/useAuth.ts";
import useJob from "../hooks/useJob.ts";
import useLiveTrainingProgress from "../hooks/useLiveTrainingProgress.ts";
import useLoginContext from "../hooks/useLoginContext.ts";
import { cancelJob, downloadArtifact } from "../services/trainingService.ts";
import { rawSessionView } from "../services/trainingMapper.ts";
import { createDeployment } from "../services/deploymentService.ts";
import { countActiveForGame, listDeploymentViews } from "../services/trainerViewService.ts";

/**
 * The live page mirrors the run's life:
 *
 *   queued    — one card: connect your trainer (this page is already
 *               subscribed; it flips the moment the trainer reports).
 *   running   — the chart and the numbers, live.
 *   terminal  — outcome + what you can do with it (download, deploy, rerun).
 *
 * Deeper data is opt-in: the event log and the advanced panel (ids,
 * artifact integrity, raw session data) live behind disclosures.
 */
export default function TrainingJobLive(): JSX.Element {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { user } = useLoginContext();
  const auth = useAuth();
  const { job, loading, error, refetch } = useJob(jobId);

  // Real sessions start queued; subscribe from the start so the first
  // report flips this page live without a reload.
  const liveEligible = job !== null && (job.status === "running" || job.status === "queued");
  const live = useLiveTrainingProgress(liveEligible ? jobId : undefined);

  const liveStatus = live.latest?.status;
  useEffect(() => {
    if (!(live.isComplete || live.hasFailed)) return;
    refetch();
    // The reporter uploads the .pth AFTER complete(); a few staged re-reads
    // let the Download button appear even when the upload takes a moment.
    const lateRefetches = [1500, 4000, 9000].map((ms) => setTimeout(refetch, ms));
    return () => lateRefetches.forEach(clearTimeout);
  }, [live.isComplete, live.hasFailed, refetch]);
  useEffect(() => {
    if (job?.status === "queued" && liveStatus === "running") refetch();
  }, [job?.status, liveStatus, refetch]);

  const [cancelArmed, setCancelArmed] = useState(false);
  const [deployBusy, setDeployBusy] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);

  async function handleCancel() {
    if (!jobId) return;
    await cancelJob(jobId, auth);
    refetch();
    setCancelArmed(false);
  }

  async function handleDownload() {
    if (!jobId) return;
    const blob = await downloadArtifact(jobId);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${jobId}.pth`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  const handleDeploy = useCallback(async () => {
    if (!job) return;
    setDeployBusy(true);
    setDeployError(null);
    try {
      // Real cap check against live deployment state, right before deploying.
      const views = await listDeploymentViews(user.username);
      if (countActiveForGame(views, job.gameKey) >= 3) {
        setDeployError(
          `You already have 3 active deployments in ${trainerGameNames[job.gameKey]}. ` +
            "Pause or retire one first.",
        );
        return;
      }
      const dep = await createDeployment(job.modelId, { displayName: job.modelDisplayName }, auth);
      void navigate(`/trainer?tab=deployments#${dep.id}`);
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : "Deploy failed");
    } finally {
      setDeployBusy(false);
    }
  }, [job, user.username, auth, navigate]);

  // Chart series accumulate from the live stream while this page is open.
  const liveSeries = useMemo(() => {
    if (!job) return { episodes: [], meanReward: [], winRate: [] };
    const episodes = job.episodesSeries.slice();
    const meanReward = job.meanRewardSeries.slice();
    const winRate = job.winRateSeries.slice();
    for (const event of live.events) {
      if (event.epoch === undefined) continue;
      const reward = event.metrics?.meanReward;
      const rate = event.metrics?.winRate;
      // Never chart a number the trainer didn't send: skip metric-less
      // events; carry the last value when only one series is reported.
      if (reward === undefined && rate === undefined) continue;
      episodes.push(event.epoch);
      meanReward.push(reward ?? meanReward[meanReward.length - 1] ?? 0);
      winRate.push(rate ?? winRate[winRate.length - 1] ?? 0);
    }
    return { episodes, meanReward, winRate };
  }, [job, live.events]);

  if (loading && !job) {
    return (
      <div className="ga-live-job" data-testid="training-job-live-loading">
        <Skeleton variant="rect" width={220} height={28} />
        <Skeleton variant="rect" width="100%" height={240} />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="ga-live-job" data-testid="training-job-live-error">
        <ErrorState
          title="Could not load training run"
          body={error?.message ?? "Run not found"}
          retry={() => refetch()}
        />
      </div>
    );
  }

  const episodesNow = live.latest?.epoch ?? job.progressEpisodes;
  const winRateNow = live.latest?.metrics?.winRate ?? job.currentWinRate;
  const meanRewardNow = live.latest?.metrics?.meanReward ?? job.currentMeanReward;
  const showChart = job.status !== "queued";

  return (
    <div className="ga-live-job" data-testid="training-job-live">
      <header className="ga-live-job__hero" data-testid="training-job-header">
        <div className="ga-live-job__meta">
          <h1>{job.modelDisplayName}</h1>
          <Badge variant="default" testId="training-job-game">
            {trainerGameNames[job.gameKey]}
          </Badge>
          <JobStatusPill status={job.status} />
          {job.status === "running" && <LiveTrainingDot active label="Live" />}
          {job.status !== "queued" && (
            <span data-testid="episode-progress">
              {episodesNow.toLocaleString()} / {job.targetEpisodes.toLocaleString()} episodes
            </span>
          )}
          <span data-testid="elapsed-time">
            started <TimeAgo date={job.createdAt} />
          </span>
        </div>
      </header>

      {job.status === "queued" && <ConnectTrainerCard jobId={job.id} />}

      {showChart && (
        <section className="ga-live-job__chart" data-testid="live-chart-section">
          <JobProgressChart
            episodes={liveSeries.episodes}
            meanReward={liveSeries.meanReward}
            winRate={liveSeries.winRate}
            isLive={job.status === "running"}
            variant="full"
            title="Learning curve"
          />
          {job.status === "running" && (
            <p className="ga-live-job__chart-note">live since you opened this page</p>
          )}
          <div className="ga-live-job__metrics" data-testid="job-metrics">
            <div className="ga-live-job__metric" data-testid="metric-win-rate">
              <span className="ga-live-job__metric-label">Win rate</span>
              <span className="ga-live-job__metric-value">{(winRateNow * 100).toFixed(1)}%</span>
            </div>
            <div className="ga-live-job__metric" data-testid="metric-mean-reward">
              <span className="ga-live-job__metric-label">Mean reward</span>
              <span className="ga-live-job__metric-value">{meanRewardNow.toFixed(3)}</span>
            </div>
            <div className="ga-live-job__metric" data-testid="metric-episodes">
              <span className="ga-live-job__metric-label">Episodes</span>
              <span className="ga-live-job__metric-value">{episodesNow.toLocaleString()}</span>
            </div>
          </div>
        </section>
      )}

      {job.status === "failed" && job.error && (
        <p className="ga-live-job__failure" data-testid="job-failure-reason">
          {job.error}
        </p>
      )}

      {showChart && (
        <Disclosure
          level="section"
          summary="Event log"
          meta={<span className="ga-live-job__count">{live.events.length} events</span>}
          open={logOpen}
          onToggle={setLogOpen}
          testId="event-log"
        >
          <JobLogStream events={live.events} />
        </Disclosure>
      )}

      <Disclosure
        level="section"
        summary="Advanced"
        open={advancedOpen}
        onToggle={setAdvancedOpen}
        testId="advanced-panel"
      >
        <div className="ga-live-job__advanced">
          <CopyField label="Job id" value={job.id} testId="advanced-job-id" />
          <CopyField label="Model id" value={job.modelId} testId="advanced-model-id" />
          {job.artifactMeta && (
            <p data-testid="advanced-artifact">
              Artifact: {(job.artifactMeta.bytes / 1024).toFixed(1)} KiB · sha256{" "}
              <code>{job.artifactMeta.sha256}</code> · uploaded{" "}
              <TimeAgo date={job.artifactMeta.uploadedAt} />
            </p>
          )}
          <Disclosure
            level="inline"
            summary="Raw session data"
            open={rawOpen}
            onToggle={setRawOpen}
            testId="raw-session"
          >
            <pre>{JSON.stringify(rawSessionView(job), null, 2)}</pre>
          </Disclosure>
        </div>
      </Disclosure>

      <footer className="ga-live-job__actions" data-testid="job-actions">
        {(job.status === "queued" || job.status === "running") &&
          (cancelArmed ? (
            <Button
              variant="danger"
              onClick={() => void handleCancel()}
              data-testid="cancel-confirm"
            >
              Confirm cancel
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setCancelArmed(true)} data-testid="cancel-run">
              Cancel run
            </Button>
          ))}
        {job.status === "completed" && job.hasArtifact && (
          <>
            <Button
              variant="secondary"
              onClick={() => void handleDownload()}
              data-testid="download-artifact"
            >
              Download .pth
            </Button>
            <Button
              variant="primary"
              loading={deployBusy}
              onClick={() => void handleDeploy()}
              data-testid="deploy-model"
            >
              Deploy
            </Button>
          </>
        )}
        {(job.status === "completed" || job.status === "failed" || job.status === "canceled") && (
          <Link to={`/trainer/new?fromJob=${job.id}`} data-testid="run-again">
            Run again with this configuration
          </Link>
        )}
      </footer>
      {deployError && (
        <p className="ga-live-job__deploy-error" role="alert" data-testid="deploy-error">
          {deployError}
        </p>
      )}
    </div>
  );
}
