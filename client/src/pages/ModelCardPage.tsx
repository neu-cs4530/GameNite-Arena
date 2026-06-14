import "./ModelCardPage.css";
import { useCallback, useState, type JSX } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Avatar from "../components/ui/Avatar.tsx";
import Badge from "../components/ui/Badge.tsx";
import Button from "../components/ui/Button.tsx";
import ErrorState from "../components/ui/ErrorState.tsx";
import Section from "../components/ui/Section.tsx";
import Skeleton from "../components/ui/Skeleton.tsx";
import StatTile from "../components/ui/StatTile.tsx";
import TimeAgo from "../components/ui/TimeAgo.tsx";
import { ForkButton, SlotCapacityIndicator, TrainingJobCard } from "../components/trainer/index.ts";
import { trainerGameNames } from "../components/trainer/trainerConsts.ts";
import useAsync from "../hooks/useAsync.ts";
import useAuth from "../hooks/useAuth.ts";
import useLoginContext from "../hooks/useLoginContext.ts";
import useModel from "../hooks/useModel.ts";
import { createDeployment } from "../services/deploymentService.ts";
import { listSessionsFor } from "../services/trainingService.ts";
import {
  countActiveForGame,
  DEPLOYMENT_CAP_PER_GAME,
  listDeploymentViews,
} from "../services/trainerViewService.ts";

/**
 * The public card for one model — every number on it is real: the model
 * record itself, the training sessions that produced it, and its live
 * deployment slots (with their actual arena ratings when rated games have
 * been played). What the platform does not track yet simply is not shown.
 */
export default function ModelCardPage(): JSX.Element {
  const { modelId } = useParams();
  const navigate = useNavigate();
  const { user } = useLoginContext();
  const auth = useAuth();
  const { model, loading, error, refetch } = useModel(modelId);

  const ownerUsername = model?.owner.username;

  /* Real training history: the owner's sessions, filtered to this model. */
  const sessions = useAsync(
    useCallback(
      () => (ownerUsername ? listSessionsFor(ownerUsername) : Promise.resolve([])),
      [ownerUsername],
    ),
    [ownerUsername],
  );
  const trainingHistory = (sessions.data ?? []).filter((job) => job.modelId === model?.id);

  /* Real deployments: the owner's slots, filtered to this model. */
  const deploymentsResult = useAsync(
    useCallback(
      () => (ownerUsername ? listDeploymentViews(ownerUsername) : Promise.resolve([])),
      [ownerUsername],
    ),
    [ownerUsername],
  );
  const allOwnerDeployments = deploymentsResult.data ?? [];
  const deployments = allOwnerDeployments.filter((d) => d.modelId === model?.id);
  const bestRating = deployments.find((d) => d.rating)?.rating;

  const [deployBusy, setDeployBusy] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="ga-model-page" data-testid="model-card-page-skeleton">
        <Skeleton variant="rect" width="100%" height={120} />
        <Skeleton variant="rect" width="100%" height={200} />
        <Skeleton variant="rect" width="100%" height={300} />
      </div>
    );
  }

  if (error || !model) {
    return (
      <div className="ga-model-page">
        <ErrorState
          title="Model not found"
          body={error?.message ?? "We couldn't find that model."}
          retry={() => refetch()}
        />
      </div>
    );
  }

  const isOwner = model.owner.username === user.username;
  const slotsUsed = countActiveForGame(allOwnerDeployments, model.gameKey);
  const capFull = slotsUsed >= DEPLOYMENT_CAP_PER_GAME;
  const hasArtifact = model.sourceRef !== "";

  async function handleDeploy() {
    if (!model) return;
    setDeployBusy(true);
    setDeployError(null);
    try {
      const dep = await createDeployment(model.id, { displayName: model.displayName }, auth);
      void navigate(`/trainer?tab=deployments#${dep.id}`);
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : "Deploy failed");
    } finally {
      setDeployBusy(false);
    }
  }

  return (
    <div className="ga-model-page" data-testid="model-card-page">
      <header className="ga-model-page__header" data-testid="model-card-page-header">
        <div className="ga-model-page__title-block">
          <div className="ga-model-page__badges">
            <Badge variant="default">{trainerGameNames[model.gameKey]}</Badge>
            <Badge variant={model.visibility === "public" ? "info" : "default"}>
              {model.visibility === "public" ? "Public" : "Private"}
            </Badge>
            {!hasArtifact && (
              <Badge variant="warning" title="No trained .pth stored yet">
                No artifact
              </Badge>
            )}
          </div>
          <h1>{model.displayName}</h1>
          <div className="ga-model-page__owner">
            <Avatar name={model.owner.displayName} size="sm" variant="default" />
            <Link to={`/profile/${model.owner.username}`} data-testid="model-card-owner-link">
              {model.owner.displayName}
            </Link>
            <span className="ga-model-page__owner-username">@{model.owner.username}</span>
          </div>
        </div>
        <div className="ga-model-page__header-actions">
          {model.visibility === "public" && <ForkButton model={model} />}
          {isOwner && (
            <Button
              variant="primary"
              loading={deployBusy}
              onClick={() => void handleDeploy()}
              disabled={capFull || !hasArtifact}
              title={
                capFull
                  ? `You already have ${DEPLOYMENT_CAP_PER_GAME} active deployments in ${trainerGameNames[model.gameKey]}.`
                  : !hasArtifact
                    ? "Train this model first — there is no artifact to deploy."
                    : undefined
              }
              data-testid="model-card-deploy"
            >
              Deploy
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => void navigate(`/replays?modelId=${model.id}`)}
            data-testid="view-related-replays"
          >
            View related replays
          </Button>
        </div>
        {capFull && isOwner && (
          <div className="ga-model-page__cap-warning" role="alert">
            You already have {DEPLOYMENT_CAP_PER_GAME} active deployments in{" "}
            {trainerGameNames[model.gameKey]}.
            <Link to="/trainer?tab=deployments">Manage deployments</Link>
          </div>
        )}
        {deployError && (
          <p className="ga-model-page__deploy-error" role="alert" data-testid="deploy-error">
            {deployError}
          </p>
        )}
      </header>

      <Section title="At a glance" testId="model-card-stats">
        <div className="ga-model-page__stats">
          <StatTile
            label="Arena rating"
            value={bestRating ? Math.round(bestRating.rating) : "Unrated"}
            sub={bestRating ? `${bestRating.gamesPlayed} rated games` : "no rated games yet"}
            testId="stat-rating"
          />
          <StatTile
            label="Deployments"
            value={deployments.length}
            sub={`${deployments.filter((d) => d.status === "active").length} active`}
            testId="stat-deployments"
          />
          <StatTile
            label="Training runs"
            value={sessions.data === null ? "…" : trainingHistory.length}
            testId="stat-training-runs"
          />
          <StatTile
            label="Last updated"
            value={<TimeAgo date={model.lastTrainedAt} />}
            testId="stat-last-updated"
          />
        </div>
        {isOwner && (
          <SlotCapacityIndicator
            gameKey={model.gameKey}
            used={slotsUsed}
            cap={DEPLOYMENT_CAP_PER_GAME}
            testId="model-slot-usage"
          />
        )}
      </Section>

      <Section
        title="Training history"
        subtitle="The sessions that produced this model."
        testId="model-training-history"
      >
        {sessions.error ? (
          <ErrorState
            title="Could not load training history"
            body={sessions.error.message}
            retry={sessions.refetch}
          />
        ) : sessions.data === null ? (
          <Skeleton variant="rect" width="100%" height={120} />
        ) : trainingHistory.length === 0 ? (
          <div className="ga-model-page__empty" data-testid="history-empty">
            No training runs recorded for this model.
          </div>
        ) : (
          <div className="ga-model-page__grid">
            {trainingHistory.map((job) => (
              <TrainingJobCard
                key={job.id}
                job={job}
                onClick={() => void navigate(`/trainer/jobs/${job.id}`)}
              />
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Deployments"
        subtitle="Runtime slots holding this model."
        testId="model-deployments"
      >
        {deploymentsResult.error ? (
          <ErrorState
            title="Could not load deployments"
            body={deploymentsResult.error.message}
            retry={deploymentsResult.refetch}
          />
        ) : deploymentsResult.data === null ? (
          <Skeleton variant="rect" width="100%" height={80} />
        ) : deployments.length === 0 ? (
          <div className="ga-model-page__empty" data-testid="deployments-empty">
            No deployments for this model yet.
          </div>
        ) : (
          <div className="ga-model-page__deployments" data-testid="model-deployment-list">
            {deployments.map((d) => (
              <div key={d.deploymentId} className="ga-model-page__deployment">
                <Badge
                  variant={
                    d.status === "active"
                      ? "success"
                      : d.status === "paused"
                        ? "warning"
                        : "default"
                  }
                >
                  {d.status}
                </Badge>
                <span className="ga-model-page__deployment-name">{d.displayName}</span>
                {d.rating ? (
                  <span className="ga-model-page__deployment-rating">
                    {Math.round(d.rating.rating)} · {d.rating.gamesPlayed} rated games
                  </span>
                ) : (
                  <span className="ga-model-page__deployment-rating">unrated</span>
                )}
                <span className="ga-model-page__deployment-spacer" />
                <TimeAgo date={d.createdAt} />
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
