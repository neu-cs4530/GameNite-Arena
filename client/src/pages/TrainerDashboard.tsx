import "./TrainerDashboard.css";
import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { DeploymentView } from "@gamenite/shared";
import Badge from "../components/ui/Badge.tsx";
import Button from "../components/ui/Button.tsx";
import Card from "../components/ui/Card.tsx";
import CopyField from "../components/ui/CopyField.tsx";
import Disclosure from "../components/ui/Disclosure.tsx";
import EmptyState from "../components/ui/EmptyState.tsx";
import ErrorState from "../components/ui/ErrorState.tsx";
import TimeAgo from "../components/ui/TimeAgo.tsx";
import {
  DeploymentRow,
  JobRow,
  LiveNowCard,
  SlotCapacityIndicator,
  StatusChips,
} from "../components/trainer/index.ts";
import type { ChipKind } from "../components/trainer/StatusChips.tsx";
import { MultiToggle } from "../components/filters/index.ts";
import { trainerGameNames } from "../components/trainer/trainerConsts.ts";
import useAsync from "../hooks/useAsync.ts";
import useAuth from "../hooks/useAuth.ts";
import useLoginContext from "../hooks/useLoginContext.ts";
import { cancelJob, listSessionsFor } from "../services/trainingService.ts";
import { updateDeploymentStatus } from "../services/deploymentService.ts";
import {
  countActiveForGame,
  DEPLOYMENT_CAP_PER_GAME,
  listDeploymentViews,
  listOwnModels,
} from "../services/trainerViewService.ts";
import {
  ALL_GAME_KEYS,
  type JobStatus,
  type TrainerGameKey,
  type TrainingJobDetail,
} from "../util/types.ts";

type SectionKey = "runs" | "deployments" | "models";

const chipToStatuses: Record<Exclude<ChipKind, "deployed">, JobStatus[]> = {
  running: ["running"],
  queued: ["queued"],
  completed: ["completed"],
  failed: ["failed"],
};

/**
 * The trainer dashboard, organized as a build-up instead of an info dump:
 *
 *   Tier 0 (glance)  — count chips + at most one Live-Now card. The chips
 *                      ARE the doors: clicking one opens its section,
 *                      pre-filtered. Nothing renders for zero-count states.
 *   Tier 1 (section) — Runs / Deployments / Models as disclosures. Runs
 *                      auto-opens only when something is actually running
 *                      (an initial-state decision — refetches never reopen
 *                      what the user closed).
 *   Tier 2 (row)     — expand a run for config, full error, artifact
 *                      integrity, ids.
 *   Tier 3 (raw)     — the raw session data, nested one level deeper.
 *
 * Every number on this page comes from the live API — there is no mock
 * data on the trainer workflow surfaces.
 */
export default function TrainerDashboard(): JSX.Element {
  const { user } = useLoginContext();
  const auth = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const jobsResult = useAsync(
    useCallback(() => listSessionsFor(user.username), [user.username]),
    [user.username],
  );
  const deploymentsResult = useAsync(
    useCallback(() => listDeploymentViews(user.username), [user.username]),
    [user.username],
  );
  const modelsResult = useAsync(
    useCallback(() => listOwnModels(user.username), [user.username]),
    [user.username],
  );

  const jobs = useMemo(() => jobsResult.data ?? [], [jobsResult.data]);
  const deployments = useMemo(() => deploymentsResult.data ?? [], [deploymentsResult.data]);
  const models = modelsResult.data ?? [];

  const running = useMemo(() => jobs.filter((j) => j.status === "running"), [jobs]);
  const queued = useMemo(() => jobs.filter((j) => j.status === "queued"), [jobs]);
  const activeDeployments = useMemo(
    () => deployments.filter((d) => d.status === "active"),
    [deployments],
  );

  /* Disclosure state: the user's explicit toggles win; until the first
   * toggle, the open set DERIVES from data + deep link (runs auto-open only
   * while something is running — and refetches never reopen a section the
   * user closed, because a toggle freezes the whole record). */
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean> | null>(null);
  const [statusFilter, setStatusFilter] = useState<JobStatus[]>([]);
  const [gameFilter, setGameFilter] = useState<TrainerGameKey[]>([]);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  const deepLinkTab = searchParams.get("tab");
  const highlightDeployment = useMemo(() => window.location.hash.replace("#", "") || null, []);
  const derivedSections = useMemo<Record<SectionKey, boolean>>(
    () => ({
      runs: running.length > 0 || deepLinkTab === "runs" || deepLinkTab === "jobs",
      deployments: deepLinkTab === "deployments" || highlightDeployment !== null,
      models: deepLinkTab === "models",
    }),
    [running.length, deepLinkTab, highlightDeployment],
  );
  const sections = openSections ?? derivedSections;

  /* Deep links scroll to their (now open) section once data is up. */
  useEffect(() => {
    if (jobsResult.data === null) return;
    if (!deepLinkTab && !highlightDeployment) return;
    const target =
      deepLinkTab === "jobs" || deepLinkTab === "runs" ? "runs" : (deepLinkTab ?? "deployments");
    const timer = setTimeout(() => {
      document.getElementById(`trainer-section-${target}`)?.scrollIntoView({ block: "start" });
    }, 50);
    return () => clearTimeout(timer);
  }, [jobsResult.data, deepLinkTab, highlightDeployment]);

  /* Keep the page current while runs are active — the interval refetches
   * data only and never touches disclosure state. */
  useEffect(() => {
    if (running.length === 0 && queued.length === 0) return;
    const timer = setInterval(() => jobsResult.refetch(), 8000);
    return () => clearInterval(timer);
  }, [running.length, queued.length, jobsResult]);

  /* Global "n" shortcut launches a new run. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "n") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
      void navigate("/trainer/new");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const setSection = useCallback(
    (key: SectionKey, open: boolean) => {
      setOpenSections((prev) => ({ ...(prev ?? sections), [key]: open }));
    },
    [sections],
  );

  const openChip = useCallback(
    (kind: ChipKind) => {
      if (kind === "deployed") {
        setSection("deployments", true);
        document.getElementById("trainer-section-deployments")?.scrollIntoView({ block: "start" });
        return;
      }
      setStatusFilter(chipToStatuses[kind]);
      setSection("runs", true);
      document.getElementById("trainer-section-runs")?.scrollIntoView({ block: "start" });
    },
    [setSection],
  );

  async function handleCancelJob(jobId: string) {
    await cancelJob(jobId, auth);
    jobsResult.refetch();
  }

  async function setDeploymentTo(deploymentId: string, status: "active" | "paused" | "retired") {
    await updateDeploymentStatus(deploymentId, status, auth);
    deploymentsResult.refetch();
  }

  const counts = {
    running: running.length,
    queued: queued.length,
    completed: jobs.filter((j) => j.status === "completed").length,
    failed: jobs.filter((j) => j.status === "failed").length,
    deployed: activeDeployments.length,
  };

  const visibleJobs = jobs.filter(
    (j) =>
      (statusFilter.length === 0 || statusFilter.includes(j.status)) &&
      (gameFilter.length === 0 || gameFilter.includes(j.gameKey)),
  );

  const liveNow = running[0] ?? queued[0];
  const moreActive = running.length + queued.length - (liveNow ? 1 : 0);
  const nothingYet =
    jobsResult.data !== null &&
    deploymentsResult.data !== null &&
    jobs.length === 0 &&
    deployments.length === 0;

  const loadError = jobsResult.error ?? deploymentsResult.error ?? modelsResult.error;

  return (
    <div className="ga-trainer" data-testid="trainer-dashboard">
      <header className="ga-trainer__hero">
        <div>
          <h1>AI Trainer</h1>
          <p>Train on your machine. Watch, manage, and deploy here.</p>
        </div>
        <div className="ga-trainer__hero-actions">
          <Button
            variant="secondary"
            onClick={() => window.open("/api/training/kit/install.sh", "_blank")}
            data-testid="download-training-kit"
          >
            Get the local training kit
          </Button>
          <Button
            variant="primary"
            onClick={() => void navigate("/trainer/new")}
            data-testid="start-new-run"
          >
            New training run
          </Button>
        </div>
      </header>

      {loadError && (
        <ErrorState
          title="Could not load trainer data"
          body={loadError.message}
          retry={() => {
            jobsResult.refetch();
            deploymentsResult.refetch();
            modelsResult.refetch();
          }}
        />
      )}

      <StatusChips counts={counts} onOpen={openChip} />

      {liveNow && (
        <LiveNowCard job={liveNow} moreActive={moreActive} onShowAll={() => openChip("running")} />
      )}

      {nothingYet && (
        <Card testId="trainer-quickstart">
          <div className="ga-trainer__quickstart">
            <h2>Nothing training yet</h2>
            <p>Two steps to your first live run:</p>
            <ol>
              <li>
                <strong>Get the kit</strong> — one line, everything included:
                <CopyField
                  value={`curl -fsSL ${window.location.origin}/api/training/kit/install.sh | sh`}
                  testId="quickstart-kit-command"
                />
              </li>
              <li>
                <strong>Start a run</strong> from the kit folder and watch it appear here live:
                <CopyField
                  value={`python3 demo_local_session.py --username ${user.username} --password <your password>`}
                  testId="quickstart-run-command"
                />
              </li>
            </ol>
          </div>
        </Card>
      )}

      <Disclosure
        id="trainer-section-runs"
        testId="trainer-section-runs"
        summary="Training runs"
        meta={<span className="ga-trainer__section-count">{jobs.length}</span>}
        open={sections.runs}
        onToggle={(open) => setSection("runs", open)}
      >
        {jobs.length > 0 && (
          <div className="ga-trainer__filters" data-testid="runs-filters">
            <MultiToggle
              label="Game"
              options={ALL_GAME_KEYS.map((g) => ({ value: g, label: trainerGameNames[g] }))}
              value={gameFilter}
              onChange={setGameFilter}
            />
            {(statusFilter.length > 0 || gameFilter.length > 0) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatusFilter([]);
                  setGameFilter([]);
                }}
                data-testid="runs-clear-filters"
              >
                Clear filters
              </Button>
            )}
          </div>
        )}
        {visibleJobs.length === 0 ? (
          <EmptyState
            title={jobs.length === 0 ? "No training runs yet" : "Nothing matches these filters"}
            body={
              jobs.length === 0 ? "Register a run or start one straight from the kit." : undefined
            }
            action={
              jobs.length > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStatusFilter([]);
                    setGameFilter([]);
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
            testId="runs-empty"
          />
        ) : (
          <div className="ga-trainer__rows" data-testid="runs-list">
            {visibleJobs.map((job: TrainingJobDetail) => (
              <JobRow
                key={job.id}
                job={job}
                expanded={expandedJob === job.id}
                onToggle={(open) => setExpandedJob(open ? job.id : null)}
                onCancel={handleCancelJob}
              />
            ))}
          </div>
        )}
      </Disclosure>

      <Disclosure
        id="trainer-section-deployments"
        testId="trainer-section-deployments"
        summary="Deployments"
        meta={
          <span className="ga-trainer__section-count">
            {activeDeployments.length} active · {deployments.length} total
          </span>
        }
        open={sections.deployments}
        onToggle={(open) => setSection("deployments", open)}
      >
        <div className="ga-trainer__slots" data-testid="slot-capacity-strip">
          {ALL_GAME_KEYS.map((game) => (
            <SlotCapacityIndicator
              key={game}
              gameKey={game}
              used={countActiveForGame(deployments, game)}
              cap={DEPLOYMENT_CAP_PER_GAME}
            />
          ))}
        </div>
        {deployments.length === 0 ? (
          <EmptyState
            title="Nothing deployed"
            body="Complete a run, upload its artifact, and deploy it from the live page."
            testId="deployments-empty"
          />
        ) : (
          <div className="ga-trainer__rows" data-testid="deployments-list">
            {deployments.map((dep: DeploymentView) => (
              <DeploymentRow
                key={dep.deploymentId}
                deployment={dep}
                highlight={dep.deploymentId === highlightDeployment}
                onPause={(id) => setDeploymentTo(id, "paused")}
                onResume={(id) => setDeploymentTo(id, "active")}
                onRetire={(id) => setDeploymentTo(id, "retired")}
              />
            ))}
          </div>
        )}
      </Disclosure>

      <Disclosure
        id="trainer-section-models"
        testId="trainer-section-models"
        summary="Your models"
        meta={<span className="ga-trainer__section-count">{models.length}</span>}
        open={sections.models}
        onToggle={(open) => setSection("models", open)}
      >
        {models.length === 0 ? (
          <EmptyState
            title="No models yet"
            body="Every training run creates (or continues) a model."
            testId="models-empty"
          />
        ) : (
          <div className="ga-trainer__rows" data-testid="models-list">
            {models.map((model) => (
              <div key={model.modelId} className="ga-trainer__model-row" data-testid="model-row">
                <span className="ga-trainer__model-name">{model.displayName}</span>
                <Badge variant="default">{trainerGameNames[model.gameKey]}</Badge>
                {model.hasArtifact ? (
                  <Badge variant="success" testId="model-row-artifact">
                    trained
                  </Badge>
                ) : (
                  <Badge variant="default">no artifact yet</Badge>
                )}
                <span className="ga-trainer__model-spacer" />
                <TimeAgo date={model.updatedAt} />
              </div>
            ))}
          </div>
        )}
        <p className="ga-trainer__models-footer">
          <Link to="/models">Browse all public models →</Link>
        </p>
      </Disclosure>
    </div>
  );
}
