import "./DeploymentCard.css";
import { useState, type JSX } from "react";
import { Link } from "react-router-dom";
import Card from "../ui/Card.tsx";
import Badge from "../ui/Badge.tsx";
import Button from "../ui/Button.tsx";
import TimeAgo from "../ui/TimeAgo.tsx";
import LiveTrainingDot from "./LiveTrainingDot.tsx";
import InvalidMoveStreakIndicator from "./InvalidMoveStreakIndicator.tsx";
import SlotCapacityIndicator from "./SlotCapacityIndicator.tsx";
import { trainerGameIcons, trainerGameNames } from "./trainerConsts.ts";
import type { DeploymentDetail, DeploymentSummary, DeploymentStatus } from "../../util/types.ts";

interface DeploymentCardProps {
  deployment: DeploymentSummary | DeploymentDetail;
  onPause?: () => void;
  onResume?: () => void;
  onRetire?: () => void;
  /** Optional slot usage to render the in-card capacity indicator. */
  slotUsed?: number;
  slotCap?: number;
  testId?: string;
}

const statusVariant: Record<DeploymentStatus, "success" | "warning" | "default"> = {
  active: "success",
  paused: "warning",
  retired: "default",
};

const statusLabel: Record<DeploymentStatus, string> = {
  active: "Active",
  paused: "Paused",
  retired: "Retired",
};

function isDetail(d: DeploymentSummary | DeploymentDetail): d is DeploymentDetail {
  return "activitySeries" in d;
}

function buildSparklinePath(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  const max = Math.max(1, ...values);
  return values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * width;
      const y = height - (v / max) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

/** Trainer-side deployment card. Reuses existing UI primitives + Tier badges. */
export default function DeploymentCard({
  deployment,
  onPause,
  onResume,
  onRetire,
  slotUsed,
  slotCap = 3,
  testId = "deployment-card",
}: DeploymentCardProps): JSX.Element {
  const detail = isDetail(deployment) ? deployment : undefined;
  const activity = detail?.activitySeries ?? [];
  const sparkW = 240;
  const sparkH = 32;
  const sparkPath = buildSparklinePath(
    activity.map((a) => a.matchesPlayed),
    sparkW,
    sparkH,
  );
  const [confirmRetire, setConfirmRetire] = useState(false);

  return (
    <Card
      className="ga-deployment-card"
      density="default"
      testId={testId}
      ariaLabel={`Deployment: ${deployment.displayName}`}
    >
      <div className="ga-deployment-card__top">
        <div className="ga-deployment-card__title-row">
          <span aria-hidden="true">{trainerGameIcons[deployment.gameKey]}</span>
          <span className="ga-deployment-card__title" data-testid="deployment-card-title">
            {deployment.displayName}
          </span>
          <Badge variant="default" testId="deployment-card-game">
            {trainerGameNames[deployment.gameKey]}
          </Badge>
        </div>
        <Badge variant={statusVariant[deployment.status]} testId="job-status-pill">
          {statusLabel[deployment.status]}
        </Badge>
      </div>

      <div className="ga-deployment-card__meta">
        <Link
          to={`/models/${deployment.modelId}`}
          className="ga-deployment-card__link"
          onClick={(e) => e.stopPropagation()}
          data-testid="deployment-card-model"
        >
          {deployment.modelDisplayName}
        </Link>
        <span data-testid="deployment-card-elo">Elo {deployment.elo}</span>
        <span data-testid="deployment-card-matches">
          {deployment.matchesPlayed.toLocaleString()} matches
        </span>
        <InvalidMoveStreakIndicator
          streak={deployment.invalidMoveStreak}
          threshold={deployment.invalidMoveThreshold}
        />
        {deployment.status === "active" && (
          <LiveTrainingDot active testId="playing-live-indicator" label="Playing live" />
        )}
        {deployment.lastForfeitAt && (
          <span className="ga-deployment-card__forfeit" data-testid="deployment-card-last-forfeit">
            Last forfeit <TimeAgo date={deployment.lastForfeitAt} />
          </span>
        )}
      </div>

      {slotUsed !== undefined && (
        <SlotCapacityIndicator
          gameKey={deployment.gameKey}
          used={slotUsed}
          cap={slotCap}
          testId="slot-capacity-indicator"
        />
      )}

      {activity.length > 1 && (
        <div className="ga-deployment-card__sparkline" data-testid="activity-sparkline">
          <svg viewBox={`0 0 ${sparkW} ${sparkH}`} role="img" aria-label="Recent activity">
            <path d={sparkPath} className="ga-deployment-card__sparkline-line" />
          </svg>
        </div>
      )}

      <div className="ga-deployment-card__actions">
        {deployment.lastMatchId && (
          <Link
            to={`/replays/${deployment.lastMatchId}`}
            onClick={(e) => e.stopPropagation()}
            data-testid="deployment-card-last-match"
          >
            Watch most recent match
          </Link>
        )}
        {deployment.status === "active" && onPause && (
          <Button variant="secondary" size="sm" onClick={onPause} data-testid="deployment-pause">
            Pause
          </Button>
        )}
        {deployment.status === "paused" && onResume && (
          <Button variant="primary" size="sm" onClick={onResume} data-testid="deployment-resume">
            Resume
          </Button>
        )}
        {deployment.status !== "retired" && onRetire && !confirmRetire && (
          <Button
            variant="danger"
            size="sm"
            onClick={() => setConfirmRetire(true)}
            data-testid="deployment-retire"
          >
            Retire
          </Button>
        )}
        {confirmRetire && onRetire && (
          <>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                onRetire();
                setConfirmRetire(false);
              }}
              data-testid="deployment-confirm-retire"
            >
              Confirm retire
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmRetire(false)}>
              Cancel
            </Button>
          </>
        )}
        <span style={{ marginLeft: "auto" }}>
          <TimeAgo date={deployment.createdAt} testId="deployment-card-time" />
        </span>
      </div>
    </Card>
  );
}
