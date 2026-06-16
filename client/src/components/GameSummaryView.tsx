import "./GameSummaryView.css";
import type { GameInfo } from "@gamenite/shared";
import { NavLink } from "react-router-dom";
import { gameNames } from "../util/consts.ts";
import useTimeSince from "../hooks/useTimeSince.ts";

export default function GameSummaryView({
  gameId,
  status,
  type,
  players,
  createdAt,
  createdBy,
}: GameInfo) {
  const timeSince = useTimeSince();
  const numPlayers = players.length;
  return (
    <div className="ga-game-summary" role="listitem">
      <NavLink to={`/game/${gameId}`} className="ga-game-summary__title">
        {gameNames[type]}
      </NavLink>
      <div className="ga-game-summary__meta">
        <span>
          {createdBy.display} &middot; {timeSince(createdAt)}
        </span>
        <span className="ga-game-summary__badge">
          {status}
          {status !== "done" && ` · ${numPlayers}p`}
        </span>
      </div>
    </div>
  );
}
