import "./TrainerDashboard.css";
import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Section from "../components/ui/Section.tsx";
import Button from "../components/ui/Button.tsx";
import EmptyState from "../components/ui/EmptyState.tsx";
import ErrorState from "../components/ui/ErrorState.tsx";

import useLoginContext from "../hooks/useLoginContext.ts";
import useJobs from "../hooks/useJobs.ts";
import useModels from "../hooks/useModels.ts";
import useDeployments from "../hooks/useDeployments.ts";

import {
  ALL_GAME_KEYS,
  defaultJobFilters,
  defaultModelFilters,
  DeploymentCapExceededError,
  type DeploymentStatus,
  type JobStatus,
  type TrainerGameKey,
  type TrainingJobDetail,
  type TrainingJobSummary,
} from "../util/types.ts";

import {
  TrainingJobCard,
  TrainingJobCardSkeleton,
  ModelCard,
  ModelCardSkeleton,
  DeploymentCard,
  DeploymentCardSkeleton,
  SlotCapacityIndicator,
  HelloWorldTemplateButton,
  ModelFilterBar,
  DeploymentFilterBar,
  CompareRunsPanel,
} from "../components/trainer/index.ts";
import useModelFilters from "../hooks/useModelFilters.ts";
import useDeploymentFilters from "../hooks/useDeploymentFilters.ts";
import { downloadArtifact, getJob } from "../services/trainingService.ts";
import { createDeployment, updateDeploymentStatus } from "../services/deploymentService.ts";
import { countActiveDeploymentsForGame } from "../__mocks__/training.ts";

const ACTIVE_STATUSES: JobStatus[] = ["queued", "running"];
const RECENT_STATUSES: JobStatus[] = ["completed", "failed", "canceled"];
const NON_RETIRED: DeploymentStatus[] = ["active", "paused"];

export default function TrainerDashboard(): JSX.Element {
  const { user } = useLoginContext();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusedTab = searchParams.get("tab");
  const deploymentsRef = useRef<HTMLDivElement | null>(null);
  const modelsRef = useRef<HTMLDivElement | null>(null);
  const jobsRef = useRef<HTMLDivElement | null>(null);
  const [capError, setCapError] = useState<DeploymentCapExceededError | null>(null);

  // Scroll focused section into view when the ?tab= param is present.
  useEffect(() => {
    if (focusedTab === "deployments" && deploymentsRef.current) {
      deploymentsRef.current.scrollIntoView({ block: "start" });
    } else if (focusedTab === "models" && modelsRef.current) {
      modelsRef.current.scrollIntoView({ block: "start" });
    } else if (focusedTab === "jobs" && jobsRef.current) {
      jobsRef.current.scrollIntoView({ block: "start" });
    }
  }, [focusedTab]);

  // Global "n" shortcut launches /trainer/new.
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

  return (
    <div className="ga-trainer" data-testid="trainer-dashboard">
      <Hero username={user.username} />
      <SlotCapacityStrip viewer={user.username} />

      {capError && (
        <CapExceededError
          gameLabel={gameLabel(capError.gameKey)}
          onDismiss={() => setCapError(null)}
        />
      )}

      <div ref={jobsRef}>
        <JobsSection viewer={user.username} navigate={navigate} />
      </div>
      <div ref={deploymentsRef}>
        <DeploymentsSection viewer={user.username} />
      </div>
      <div ref={modelsRef}>
        <ModelsSection viewer={user.username} onCapHit={(err) => setCapError(err)} />
      </div>
    </div>
  );
}

function gameLabel(key: TrainerGameKey): string {
  switch (key) {
    case "nim":
      return "Nim";
    case "guess":
      return "Number Guesser";
    case "checkers":
      return "Checkers";
    case "connect4":
      return "Connect 4";
    case "tictactoe":
      return "Tic-Tac-Toe";
  }
}

function CapExceededError({
  gameLabel: label,
  onDismiss,
}: {
  gameLabel: string;
  onDismiss: () => void;
}): JSX.Element {
  return (
    <div className="ga-trainer__cap-error" role="alert" data-testid="slot-cap-exceeded-error">
      <div>
        <strong>Deployment cap reached</strong>
        <p>You already have 3 active deployments in {label}. Pause or retire one to free a slot.</p>
      </div>
      <div className="ga-trainer__cap-error-actions">
        <Link to="/trainer?tab=deployments">Manage deployments</Link>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

function Hero({ username: _username }: { username: string }): JSX.Element {
  const navigate = useNavigate();
  return (
    <header className="ga-trainer__hero">
      <div className="ga-trainer__hero-row">
        <div>
          <h1>AI Trainer</h1>
          <p>Upload heuristics, train new models, and manage live deployments.</p>
        </div>
        <div className="ga-trainer__hero-actions">
          <HelloWorldTemplateButton />
          <Button
            variant="primary"
            onClick={() => void navigate("/trainer/new")}
            data-testid="start-new-run"
          >
            Start a new training run
          </Button>
        </div>
      </div>
    </header>
  );
}

function SlotCapacityStrip({ viewer }: { viewer: string }): JSX.Element {
  return (
    <Section
      title="Deployment slots"
      subtitle="3 active deployments per game per user (Story 2.7)."
      testId="slot-capacity-strip"
    >
      <div className="ga-trainer__slot-strip">
        {ALL_GAME_KEYS.map((g: TrainerGameKey) => (
          <SlotCapacityIndicator
            key={g}
            gameKey={g}
            used={countActiveDeploymentsForGame(viewer, g)}
          />
        ))}
      </div>
    </Section>
  );
}

function JobsSection({
  viewer,
  navigate,
}: {
  viewer: string;
  navigate: ReturnType<typeof useNavigate>;
}): JSX.Element {
  const activeFilters = useMemo(
    () => ({
      ...defaultJobFilters,
      statuses: ACTIVE_STATUSES,
      viewerUsername: viewer,
    }),
    [viewer],
  );
  const recentFilters = useMemo(
    () => ({
      ...defaultJobFilters,
      statuses: RECENT_STATUSES,
      viewerUsername: viewer,
    }),
    [viewer],
  );
  const {
    page: activePage,
    loading: activeLoading,
    error: activeError,
    refetch: activeRefetch,
  } = useJobs(activeFilters);
  const {
    page: recentPage,
    loading: recentLoading,
    error: recentError,
    refetch: recentRefetch,
  } = useJobs(recentFilters);

  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareDetails, setCompareDetails] = useState<TrainingJobDetail[]>([]);

  function toggleCompare(job: TrainingJobSummary) {
    setCompareIds((ids) => {
      const present = ids.includes(job.id);
      if (present) {
        setCompareDetails((d) => d.filter((j) => j.id !== job.id));
        return ids.filter((id) => id !== job.id);
      }
      void getJob(job.id).then((detail) =>
        setCompareDetails((d) => (d.find((j) => j.id === detail.id) ? d : [...d, detail])),
      );
      return [...ids, job.id];
    });
  }

  async function handleDownload(job: TrainingJobSummary) {
    const blob = await downloadArtifact(job.id);
    triggerDownload(blob, `${job.id}.pth`);
  }

  function handleDeploy(job: TrainingJobSummary) {
    void navigate(`/trainer/jobs/${job.id}#deploy`);
  }
  function handleRunAgain(job: TrainingJobSummary) {
    void navigate(`/trainer/new?fromJob=${job.id}`);
  }

  return (
    <>
      <Section
        title="Active training runs"
        subtitle="Currently queued or running."
        testId="trainer-section-active-jobs"
      >
        {activeError ? (
          <ErrorState
            title="Could not load training jobs"
            body={activeError.message}
            retry={() => activeRefetch()}
          />
        ) : activeLoading ? (
          <div
            className="ga-trainer__grid ga-trainer__grid--jobs"
            data-testid="trainer-active-jobs-skeleton"
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <TrainingJobCardSkeleton key={i} />
            ))}
          </div>
        ) : activePage && activePage.jobs.length === 0 ? (
          <EmptyState
            title="No active training runs"
            body="Kick one off to see live progress here."
            action={<Button onClick={() => void navigate("/trainer/new")}>Start a new run</Button>}
          />
        ) : activePage ? (
          <div className="ga-trainer__grid ga-trainer__grid--jobs">
            {activePage.jobs.map((j) => (
              <TrainingJobCard key={j.id} job={j} />
            ))}
          </div>
        ) : null}
      </Section>

      <Section
        title="Recent completed runs"
        subtitle="Download .pth or deploy from here (Stories 2.4, 2.5)."
        testId="trainer-section-recent-jobs"
      >
        {recentError ? (
          <ErrorState
            title="Could not load runs"
            body={recentError.message}
            retry={() => recentRefetch()}
          />
        ) : recentLoading ? (
          <div
            className="ga-trainer__grid ga-trainer__grid--jobs"
            data-testid="trainer-recent-jobs-skeleton"
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <TrainingJobCardSkeleton key={i} />
            ))}
          </div>
        ) : recentPage && recentPage.jobs.length === 0 ? (
          <EmptyState
            title="No completed runs yet"
            body="They'll appear here once training finishes."
          />
        ) : recentPage ? (
          <div className="ga-trainer__grid ga-trainer__grid--jobs">
            {recentPage.jobs.map((j) => (
              <TrainingJobCard
                key={j.id}
                job={j}
                onDownload={j.hasArtifact ? () => void handleDownload(j) : undefined}
                onDeploy={j.status === "completed" ? () => handleDeploy(j) : undefined}
                onRunAgain={() => handleRunAgain(j)}
                onCompareToggle={() => toggleCompare(j)}
                isComparing={compareIds.includes(j.id)}
              />
            ))}
          </div>
        ) : null}
        {compareDetails.length >= 2 && (
          <Section
            title="Compare selected runs"
            subtitle="Side-by-side learning curves for the runs you selected."
            testId="trainer-compare-section"
          >
            <CompareRunsPanel jobs={compareDetails} />
          </Section>
        )}
      </Section>
    </>
  );
}

function DeploymentsSection({ viewer }: { viewer: string }): JSX.Element {
  const { filters, setFilter, setFilters, clearFilters } = useDeploymentFilters({
    pageSize: 24,
    viewerUsername: viewer,
  });
  const mergedFilters = useMemo(
    () => ({
      ...filters,
      statuses: filters.statuses.length === 0 ? NON_RETIRED : filters.statuses,
    }),
    [filters],
  );
  const { page, loading, error, refetch } = useDeployments(mergedFilters);

  async function pause(id: string) {
    await updateDeploymentStatus(id, "paused");
    refetch();
  }
  async function resume(id: string) {
    await updateDeploymentStatus(id, "active");
    refetch();
  }
  async function retire(id: string) {
    await updateDeploymentStatus(id, "retired");
    refetch();
  }

  return (
    <Section
      title="Your deployments"
      subtitle="Each deployment is autonomously playing ranked matches (Story 2.6)."
      testId="trainer-section-deployments"
    >
      <DeploymentFilterBar
        filters={filters}
        setFilter={setFilter}
        setFilters={setFilters}
        onClear={clearFilters}
      />
      {error ? (
        <ErrorState
          title="Could not load deployments"
          body={error.message}
          retry={() => refetch()}
        />
      ) : loading ? (
        <div className="ga-trainer__grid" data-testid="trainer-deployments-skeleton">
          {Array.from({ length: 3 }).map((_, i) => (
            <DeploymentCardSkeleton key={i} />
          ))}
        </div>
      ) : page && page.deployments.length === 0 ? (
        <EmptyState
          title="No deployments yet"
          body="Train a model and click Deploy to put it in ranked rotation."
          action={<Button onClick={clearFilters}>Clear filters</Button>}
        />
      ) : page ? (
        <div className="ga-trainer__grid">
          {page.deployments.map((d) => (
            <DeploymentCard
              key={d.id}
              deployment={d}
              slotUsed={countActiveDeploymentsForGame(viewer, d.gameKey)}
              onPause={() => void pause(d.id)}
              onResume={() => void resume(d.id)}
              onRetire={() => void retire(d.id)}
            />
          ))}
        </div>
      ) : null}
    </Section>
  );
}

function ModelsSection({
  viewer,
  onCapHit,
}: {
  viewer: string;
  onCapHit: (err: DeploymentCapExceededError) => void;
}): JSX.Element {
  const navigate = useNavigate();
  const { filters, setFilter, setFilters, clearFilters } = useModelFilters({
    pageSize: 24,
    viewerUsername: viewer,
  });
  const ownerFilters = useMemo(() => ({ ...filters, ownership: "yours" as const }), [filters]);
  const effectiveFilters = filters.ownership === "all" ? ownerFilters : filters;
  const { page, loading, error, refetch } = useModels(effectiveFilters);

  async function handleDeploy(modelId: string) {
    try {
      await createDeployment(modelId, { displayName: "" });
      refetch();
    } catch (err: unknown) {
      if (err instanceof DeploymentCapExceededError) {
        onCapHit(err);
      } else {
        throw err;
      }
    }
  }

  return (
    <Section
      title="Your models"
      subtitle="Models you've trained. Click a card to view its public model card."
      testId="trainer-section-models"
      actions={
        filters.ownership !== "yours" && (
          <Button variant="ghost" size="sm" onClick={() => setFilter("ownership", "yours")}>
            Filter to yours only
          </Button>
        )
      }
    >
      <ModelFilterBar
        filters={filters}
        setFilter={setFilter}
        setFilters={setFilters}
        onClear={clearFilters}
      />
      {error ? (
        <ErrorState title="Could not load models" body={error.message} retry={() => refetch()} />
      ) : loading ? (
        <div className="ga-trainer__grid" data-testid="trainer-models-skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <ModelCardSkeleton key={i} />
          ))}
        </div>
      ) : page && page.models.length === 0 ? (
        <EmptyState
          title="No models match these filters"
          body="Try widening your Elo range or clearing a filter."
          action={
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <Button onClick={clearFilters}>Clear filters</Button>
              <Button variant="primary" onClick={() => void navigate("/trainer/new")}>
                Start your first training run
              </Button>
            </div>
          }
        />
      ) : page ? (
        <div className="ga-trainer__grid">
          {page.models.map((m) => {
            const isOwner = m.owner.username === viewer;
            const slotUsed = countActiveDeploymentsForGame(viewer, m.gameKey);
            const capFull = slotUsed >= 3;
            return (
              <ModelCard
                key={m.id}
                model={m}
                isOwner={isOwner}
                onDeploy={isOwner ? () => void handleDeploy(m.id) : undefined}
                deployDisabled={!isOwner || capFull}
                deployDisabledReason={
                  capFull
                    ? `Cap of 3 active deployments per game reached for ${gameLabel(m.gameKey)}.`
                    : undefined
                }
              />
            );
          })}
        </div>
      ) : null}
    </Section>
  );
}

// --- helpers ---------------------------------------------------------------

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

export { defaultModelFilters };
