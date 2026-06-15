import "./LiveGameCard.css";
import type { JSX } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../ui/Card.tsx";
import Button from "../ui/Button.tsx";
import TimeAgo from "../ui/TimeAgo.tsx";
import LiveDot from "./LiveDot.tsx";
import { replayGameNames } from "../../util/consts.ts";
import type { LiveGameRow } from "../../util/liveGames.ts";

interface LiveGameCardProps {
  row: LiveGameRow;
}

/** A live game on the dashboard: game type, players, Elo, LIVE badge, Watch. */
export default function LiveGameCard({ row }: LiveGameCardProps): JSX.Element {
  const navigate = useNavigate();
  const { broadcast, gameKey, players, elo } = row;
  const watchHref = `/live/${broadcast.broadcastId}`;
  const playerNames = players.length > 0 ? players.map((p) => p.display).join("  vs  ") : "Players";

  return (
    <Card
      className="ga-live-card"
      testId="live-game-card"
      interactive
      ariaLabel={`Watch live ${replayGameNames[gameKey]}`}
      onClick={() => void navigate(watchHref)}
    >
      <div className="ga-live-card__head">
        <span className="ga-live-card__game">{replayGameNames[gameKey]}</span>
        <LiveDot testId="live-game-card-livedot" />
      </div>
      <div className="ga-live-card__players">{playerNames}</div>
      <div className="ga-live-card__meta">
        {elo !== null && <span className="ga-live-card__elo">Elo {elo}</span>}
        <span className="ga-live-card__since">
          Started <TimeAgo date={broadcast.startedAt} />
        </span>
      </div>
      <Button variant="primary" size="sm" fullWidth>
        Watch
      </Button>
    </Card>
  );
}
