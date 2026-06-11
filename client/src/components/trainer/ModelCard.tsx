import "./ModelCard.css";
import type { JSX, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../ui/Card.tsx";
import Badge from "../ui/Badge.tsx";
import Avatar from "../ui/Avatar.tsx";
import Button from "../ui/Button.tsx";
import TimeAgo from "../ui/TimeAgo.tsx";
import TierBadge from "../replay/TierBadge.tsx";
import ForkButton from "./ForkButton.tsx";
import { trainerGameIcons, trainerGameNames } from "./trainerConsts.ts";
import type { ModelSummary } from "../../util/types.ts";

interface ModelCardProps {
  model: ModelSummary;
  onClick?: () => void;
  onDeploy?: () => void;
  onFork?: () => void;
  deployDisabled?: boolean;
  deployDisabledReason?: string;
  isOwner?: boolean;
  /** Optional extra actions rendered to the right of fork / deploy. */
  extraActions?: ReactNode;
  testId?: string;
}

/** Trainer-side model card; mirrors the layout of `<MatchCard>` for visual parity. */
export default function ModelCard({
  model,
  onClick,
  onDeploy,
  onFork,
  deployDisabled,
  deployDisabledReason,
  isOwner,
  extraActions,
  testId = "model-card",
}: ModelCardProps): JSX.Element {
  const navigate = useNavigate();
  function go() {
    if (onClick) onClick();
    else void navigate(`/models/${model.id}`);
  }
  return (
    <Card
      className="ga-model-card"
      density="default"
      onClick={go}
      testId={testId}
      ariaLabel={`Model: ${model.displayName}`}
    >
      <div className="ga-model-card__top">
        <div className="ga-model-card__game">
          <span className="ga-model-card__game-icon" aria-hidden="true">
            {trainerGameIcons[model.gameKey]}
          </span>
          <Badge variant="default" testId="model-card-game">
            {trainerGameNames[model.gameKey]}
          </Badge>
        </div>
        <Badge
          variant={model.visibility === "public" ? "info" : "default"}
          testId="model-card-visibility"
        >
          {model.visibility === "public" ? "Public" : "Private"}
        </Badge>
      </div>

      <div className="ga-model-card__title-row">
        <span className="ga-model-card__title" data-testid="model-card-title">
          {model.displayName}
        </span>
      </div>

      <div className="ga-model-card__owner">
        <Avatar name={model.owner.displayName} size="sm" variant="default" />
        <span data-testid="model-card-owner">{model.owner.displayName}</span>
      </div>

      <div className="ga-model-card__meta">
        <span data-testid="model-card-elo">Elo {model.elo}</span>
        <TierBadge rating={model.elo} />
        <span data-testid="model-card-winrate">{(model.winRate * 100).toFixed(0)}% win rate</span>
        <span data-testid="model-card-matches">{model.matchesPlayed.toLocaleString()} matches</span>
        <span data-testid="model-card-forks">
          <span aria-hidden="true">⑂</span> {model.forkCount}
        </span>
        {model.isStarterTemplate && (
          <Badge variant="success" testId="model-card-starter">
            Starter
          </Badge>
        )}
        {model.hasActiveDeployment && (
          <Badge variant="live" testId="model-card-deployed">
            Deployed
          </Badge>
        )}
        {model.forkedFrom && (
          <Badge variant="default" testId="model-card-fork">
            Forked
          </Badge>
        )}
      </div>

      <div className="ga-model-card__footer" onClick={(e) => e.stopPropagation()}>
        {isOwner && onDeploy && (
          <Button
            variant="primary"
            size="sm"
            onClick={onDeploy}
            disabled={deployDisabled}
            title={deployDisabled ? deployDisabledReason : undefined}
            data-testid="model-card-deploy"
          >
            Deploy
          </Button>
        )}
        {model.visibility === "public" &&
          (onFork ? (
            <Button variant="secondary" size="sm" onClick={onFork} data-testid="fork-button">
              Fork
            </Button>
          ) : (
            <ForkButton model={model} />
          ))}
        {extraActions}
        <span className="ga-model-card__footer-time">
          <TimeAgo date={model.lastTrainedAt} testId="model-card-time" />
        </span>
      </div>
    </Card>
  );
}
