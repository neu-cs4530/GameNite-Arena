import "./ModelCardPage.css";
import { useEffect, useMemo, useState, type JSX } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Avatar from "../components/ui/Avatar.tsx";
import Badge from "../components/ui/Badge.tsx";
import Button from "../components/ui/Button.tsx";
import Card from "../components/ui/Card.tsx";
import ErrorState from "../components/ui/ErrorState.tsx";
import Section from "../components/ui/Section.tsx";
import Skeleton from "../components/ui/Skeleton.tsx";
import TimeAgo from "../components/ui/TimeAgo.tsx";
import MatchCard from "../components/replay/MatchCard.tsx";
import TierBadge from "../components/replay/TierBadge.tsx";
import {
  DeploymentCard,
  ForkButton,
  ModelLineageTree,
  TrainingJobCard,
} from "../components/trainer/index.ts";
import { trainerGameNames } from "../components/trainer/trainerConsts.ts";
import useLoginContext from "../hooks/useLoginContext.ts";
import useModel from "../hooks/useModel.ts";
import useModelCard from "../hooks/useModelCard.ts";
import { getModelLineage } from "../services/modelService.ts";
import {
  countActiveDeploymentsForGame,
  findMockDeployment,
  findMockJob,
  MOCK_DEPLOYMENTS,
  MOCK_JOBS,
} from "../__mocks__/training.ts";
import { MOCK_REPLAYS } from "../__mocks__/replays.ts";
import type { DeploymentDetail, ModelSummary, TrainingJobDetail } from "../util/types.ts";

export default function ModelCardPage(): JSX.Element {
  const { modelId } = useParams();
  const navigate = useNavigate();
  const { user } = useLoginContext();
  const { model, loading, error, refetch } = useModel(modelId);
  const { stats } = useModelCard(modelId);
  const [lineage, setLineage] = useState<{
    ancestors: ModelSummary[];
    descendants: ModelSummary[];
  } | null>(null);

  useEffect(() => {
    if (!modelId) return;
    void getModelLineage(modelId)
      .then((res) => setLineage(res))
      .catch(() => setLineage({ ancestors: [], descendants: [] }));
  }, [modelId]);

  const trainingHistory = useMemo<TrainingJobDetail[]>(() => {
    if (!model) return [];
    return model.jobIds.length > 0
      ? model.jobIds.map((id) => findMockJob(id)).filter((j): j is TrainingJobDetail => !!j)
      : MOCK_JOBS.filter((j) => j.modelId === model.id);
  }, [model]);

  const deployments = useMemo<DeploymentDetail[]>(() => {
    if (!model) return [];
    return model.deploymentIds.length > 0
      ? model.deploymentIds
          .map((id) => findMockDeployment(id))
          .filter((d): d is DeploymentDetail => !!d)
      : MOCK_DEPLOYMENTS.filter((d) => d.modelId === model.id);
  }, [model]);

  const recentMatches = useMemo(() => {
    if (!model) return [];
    return MOCK_REPLAYS.filter((r) => r.gameKey === model.gameKey).slice(0, 4);
  }, [model]);

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
        <Button variant="secondary" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const isOwner = model.owner.username === user.username;
  const slotUsed = countActiveDeploymentsForGame(user.username, model.gameKey);
  const capFull = slotUsed >= 3;

  return (
    <div className="ga-model-page" data-testid="model-card-page">
      <header className="ga-model-page__header" data-testid="model-card-page-header">
        <div className="ga-model-page__title-block">
          <div className="ga-model-page__badges">
            <Badge variant="default">{trainerGameNames[model.gameKey]}</Badge>
            <Badge variant={model.visibility === "public" ? "info" : "default"}>
              {model.visibility === "public" ? "Public" : "Private"}
            </Badge>
            {model.isStarterTemplate && <Badge variant="success">Starter</Badge>}
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
          <span data-testid="fork-count">
            {model.forkCount} fork{model.forkCount === 1 ? "" : "s"}
          </span>
          {model.visibility === "public" && <ForkButton model={model} />}
          {isOwner && (
            <Button
              variant="primary"
              onClick={() => void navigate(`/trainer/jobs/new?modelId=${model.id}#deploy`)}
              disabled={capFull}
              title={
                capFull
                  ? `You already have 3 active deployments in ${trainerGameNames[model.gameKey]}.`
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
            You already have 3 active deployments in {trainerGameNames[model.gameKey]}.
            <Link to="/trainer?tab=deployments">Manage deployments</Link>
          </div>
        )}
      </header>

      <Section title="Stats" testId="model-card-stats">
        <div className="ga-model-page__stats">
          <Card density="compact" testId="stat-winrate">
            <div className="ga-stat__label">Win rate</div>
            <div className="ga-stat__value">
              {((stats?.winRate ?? model.winRate) * 100).toFixed(1)}%
            </div>
          </Card>
          <Card density="compact" testId="stat-avg-latency">
            <div className="ga-stat__label">Avg move latency</div>
            <div className="ga-stat__value">{stats?.averageMoveLatencyMs ?? "—"} ms</div>
          </Card>
          <Card density="compact" testId="stat-elo-per-game">
            <div className="ga-stat__label">Elo per game</div>
            <div className="ga-stat__value-row">
              {(stats?.perGameElo ?? [{ gameKey: model.gameKey, elo: model.elo }]).map((e) => (
                <span key={e.gameKey}>
                  <span>{trainerGameNames[e.gameKey]}:</span> <strong>{e.elo}</strong>{" "}
                  <TierBadge rating={e.elo} />
                </span>
              ))}
            </div>
          </Card>
          <Card density="compact" testId="stat-matches-total">
            <div className="ga-stat__label">Total matches</div>
            <div className="ga-stat__value">
              {(stats?.totalMatchesPlayed ?? model.matchesPlayed).toLocaleString()}
            </div>
          </Card>
          <Card density="compact" testId="stat-days-since-training">
            <div className="ga-stat__label">Days since last training</div>
            <div className="ga-stat__value">{stats?.daysSinceLastTraining ?? 0}</div>
          </Card>
        </div>
      </Section>

      {model.forkedFrom && (
        <Section title="Lineage" testId="model-lineage">
          <div data-testid="model-lineage-tree">
            <ModelLineageTree
              self={{ id: model.id, displayName: model.displayName }}
              ancestors={lineage?.ancestors ?? []}
              descendants={lineage?.descendants ?? []}
            />
          </div>
          <ForkedFromLink modelId={model.forkedFrom} />
        </Section>
      )}

      <Section
        title="Training history"
        subtitle="Past runs that produced this model."
        testId="model-training-history"
      >
        {trainingHistory.length === 0 ? (
          <div className="ga-model-page__empty">No training runs found for this model.</div>
        ) : (
          <div className="ga-model-page__grid">
            {trainingHistory.map((j) => (
              <TrainingJobCard key={j.id} job={j} />
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Deployments"
        subtitle="Past or current runtime slots for this model."
        testId="model-deployments"
      >
        {deployments.length === 0 ? (
          <div className="ga-model-page__empty">No deployments for this model yet.</div>
        ) : (
          <div className="ga-model-page__grid">
            {deployments.map((d) => (
              <DeploymentCard key={d.id} deployment={d} />
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Recent match performance"
        subtitle="The last ranked matches this model played."
        testId="model-recent-matches"
      >
        {recentMatches.length === 0 ? (
          <div className="ga-model-page__empty">No recent matches yet.</div>
        ) : (
          <div className="ga-model-page__grid">
            {recentMatches.map((m) => (
              <MatchCard key={m.matchId} match={m} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Last trained" testId="model-last-trained">
        <TimeAgo date={model.lastTrainedAt} />
      </Section>
    </div>
  );
}

function ForkedFromLink({ modelId }: { modelId: string }): JSX.Element {
  return (
    <Link
      to={`/models/${modelId}`}
      data-testid="lineage-node-current"
      className="ga-model-page__forked-from"
    >
      <span data-testid="lineage-node">Forked from {modelId}</span>
    </Link>
  );
}
