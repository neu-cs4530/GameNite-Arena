import "./BestAiCard.css";
import type { JSX } from "react";
import { Link } from "react-router-dom";
import type { ProfileBestAi } from "@gamenite/shared";
import Badge from "../ui/Badge.tsx";
import Card from "../ui/Card.tsx";
import EmptyState from "../ui/EmptyState.tsx";
import TierBadge from "../replay/TierBadge.tsx";
import { replayGameNames } from "../../util/consts.ts";
import type { ReplayGameKey } from "../../util/types.ts";

interface BestAiCardProps {
  bestAi: ProfileBestAi | null;
}

/**
 * The user's proudest AI: their highest-rated trained model with its archive
 * W/L. Real data from the ProfileSummary; renders an honest empty state
 * until the user has a rated model (no mock stand-in).
 */
export default function BestAiCard({ bestAi }: BestAiCardProps): JSX.Element {
  if (bestAi === null) {
    return (
      <Card className="ga-best-ai" testId="profile-best-ai">
        <h3 className="ga-best-ai__title">Best AI</h3>
        <EmptyState
          icon="⚙"
          title="No rated AI yet"
          body="Deploy a model in the Trainer to see your strongest AI here."
        />
      </Card>
    );
  }

  const gameLabel =
    bestAi.gameKey in replayGameNames
      ? replayGameNames[bestAi.gameKey as ReplayGameKey]
      : bestAi.gameKey;
  return (
    <Card className="ga-best-ai" testId="profile-best-ai">
      <h3 className="ga-best-ai__title">Best AI</h3>
      <div className="ga-best-ai__name-row">
        <Link className="ga-best-ai__name" to={`/models/${bestAi.modelId}`}>
          {bestAi.displayName}
        </Link>
        <Badge variant="ai">AI</Badge>
        <Badge variant="default">{gameLabel}</Badge>
      </div>
      <div className="ga-best-ai__stats">
        <TierBadge rating={Math.round(bestAi.rating)} withRating />
        <span className="ga-best-ai__record">
          <span className="ga-best-ai__wins">{bestAi.wins}W</span>
          {" – "}
          <span className="ga-best-ai__losses">{bestAi.losses}L</span>
          <span className="ga-best-ai__games"> over {bestAi.gamesPlayed} archived matches</span>
        </span>
      </div>
    </Card>
  );
}
