import "./DeploymentRow.css";
import { useState, type JSX } from "react";
import type { DeploymentView } from "@gamenite/shared";
import Badge from "../ui/Badge.tsx";
import Button from "../ui/Button.tsx";
import TimeAgo from "../ui/TimeAgo.tsx";
import { trainerGameNames } from "./trainerConsts.ts";

interface DeploymentRowProps {
  deployment: DeploymentView;
  onPause: (deploymentId: string) => Promise<void>;
  onResume: (deploymentId: string) => Promise<void>;
  onRetire: (deploymentId: string) => Promise<void>;
  highlight?: boolean;
}

const statusVariant = { active: "success", paused: "warning", retired: "default" } as const;

/**
 * One deployment slot at tier 1: model, game, status, and its REAL arena
 * rating when it has played rated games — plus the lifecycle actions.
 * Retire asks once (it frees the slot but keeps history).
 */
export default function DeploymentRow({
  deployment,
  onPause,
  onResume,
  onRetire,
  highlight,
}: DeploymentRowProps): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [retireArmed, setRetireArmed] = useState(false);

  async function run(action: (id: string) => Promise<void>) {
    setBusy(true);
    try {
      await action(deployment.deploymentId);
    } finally {
      setBusy(false);
      setRetireArmed(false);
    }
  }

  return (
    <div
      className={`ga-deployment-row${highlight ? " ga-deployment-row--highlight" : ""}`}
      id={deployment.deploymentId}
      data-testid="deployment-row"
    >
      <Badge variant={statusVariant[deployment.status]} testId="deployment-row-status">
        {deployment.status}
      </Badge>
      <span className="ga-deployment-row__name" data-testid="deployment-row-model">
        {deployment.modelDisplayName}
      </span>
      <Badge variant="default">{trainerGameNames[deployment.gameKey]}</Badge>
      {deployment.rating ? (
        <span className="ga-deployment-row__rating" data-testid="deployment-row-rating">
          {Math.round(deployment.rating.rating)} elo · {deployment.rating.gamesPlayed} matches
        </span>
      ) : (
        <span className="ga-deployment-row__rating ga-deployment-row__rating--none">
          no rated matches yet
        </span>
      )}
      <span className="ga-deployment-row__spacer" />
      <TimeAgo date={deployment.createdAt} />
      {deployment.status === "active" && (
        <Button
          variant="ghost"
          size="sm"
          loading={busy}
          onClick={() => void run(onPause)}
          data-testid="deployment-row-pause"
        >
          Pause
        </Button>
      )}
      {deployment.status === "paused" && (
        <Button
          variant="ghost"
          size="sm"
          loading={busy}
          onClick={() => void run(onResume)}
          data-testid="deployment-row-resume"
        >
          Resume
        </Button>
      )}
      {deployment.status !== "retired" &&
        (retireArmed ? (
          <Button
            variant="danger"
            size="sm"
            loading={busy}
            onClick={() => void run(onRetire)}
            data-testid="deployment-row-retire-confirm"
          >
            Confirm retire
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRetireArmed(true)}
            data-testid="deployment-row-retire"
          >
            Retire
          </Button>
        ))}
    </div>
  );
}
