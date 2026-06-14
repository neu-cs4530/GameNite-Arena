import "./RecapPanel.css";
import { useCallback, type JSX } from "react";
import { Link } from "react-router-dom";
import type { GameKey, MatchResultView } from "@gamenite/shared";
import Badge from "../ui/Badge.tsx";
import Card from "../ui/Card.tsx";
import Skeleton from "../ui/Skeleton.tsx";
import StatTile from "../ui/StatTile.tsx";
import UserLink from "../ui/UserLink.tsx";
import useAsync from "../../hooks/useAsync.ts";
import { getLeaderboard } from "../../services/leaderboardService.ts";
import { gameNames } from "../../util/consts.ts";
import { formatWinRate } from "../../util/leaderboardView.ts";
import { computeRankMovement, neighborSlice, type RankMovement } from "../../util/rankMovement.ts";
import {
  deriveOutcome,
  extractEntityChange,
  extractMyChange,
  formatDelta,
} from "../../util/recap.ts";
import type { LeaderboardEntry } from "../../util/types.ts";

interface RecapPanelProps {
  gameKey: GameKey;
  /** The match result pushed over the `gameResult` socket event (rated games). */
  result: MatchResultView;
  /** The viewer's index in the game's players list; -1 for watchers. */
  userPlayerIndex: number;
  /**
   * When the viewer's deployed model held the seat: the model's entity id
   * (its modelId in ratingChanges). The recap then narrates the MODEL's
   * result — "Your model won" — and tracks the model's rating movement.
   */
  modelEntityId?: string | null;
}

/** Human label for the movement strip header. */
function movementLabel(movement: RankMovement): string {
  switch (movement.direction) {
    case "up":
      return `▲ ${movement.places} place${movement.places === 1 ? "" : "s"}`;
    case "down":
      return `▼ ${movement.places} place${movement.places === 1 ? "" : "s"}`;
    case "new":
      return "New to the board";
    case "none":
      return "Rank unchanged";
  }
}

/**
 * Post-match recap for RATED games: outcome headline, the viewer's Glicko
 * change and fresh rating, and a mini leaderboard strip showing how their
 * rank moved. Rendered by GamePanel under the game frame when the server's
 * gameResult event lands for this game.
 */
export default function RecapPanel({
  gameKey,
  result,
  userPlayerIndex,
  modelEntityId = null,
}: RecapPanelProps): JSX.Element {
  const myChange =
    modelEntityId !== null
      ? extractEntityChange(result, modelEntityId)
      : extractMyChange(result, userPlayerIndex);
  const outcome =
    modelEntityId !== null
      ? deriveOutcome(result, modelEntityId, "model")
      : deriveOutcome(result, myChange?.entityId ?? null);

  // fresh=1 bypasses the server's 5-minute leaderboard cache so this read
  // sees the ratings this very game just produced.
  const board = useAsync(
    useCallback(() => getLeaderboard(gameKey, { fresh: true, limit: 100 }), [gameKey]),
    [gameKey],
  );

  const entries = board.data?.entries ?? [];
  const myEntry = myChange ? entries.find((e) => e.entityId === myChange.entityId) : undefined;
  const movement = myChange
    ? computeRankMovement(entries, myChange.entityId, myChange.delta)
    : null;
  const neighbors = myChange ? neighborSlice(entries, myChange.entityId, 3) : [];

  return (
    <Card className="ga-recap" testId="recap-panel">
      <header className="ga-recap__header">
        <h2
          className={`ga-recap__headline ga-recap__headline--${outcome.tone}`}
          data-testid="recap-headline"
        >
          {outcome.headline}
        </h2>
        <Badge variant="info" title="This game changed Glicko ratings">
          Rated
        </Badge>
      </header>

      {myChange && (
        <div className="ga-recap__tiles">
          <StatTile
            label="Glicko change"
            value={formatDelta(myChange.delta)}
            tone={myChange.delta > 0 ? "success" : myChange.delta < 0 ? "danger" : "default"}
            testId="recap-delta"
          />
          <StatTile
            label="New rating"
            value={myEntry ? Math.round(myEntry.rating) : "—"}
            testId="recap-new-rating"
          />
          {myEntry && (
            <StatTile
              label="Win rate"
              value={formatWinRate(myEntry.winRate)}
              testId="recap-winrate"
            />
          )}
        </div>
      )}

      {board.loading && board.data === null ? (
        <Skeleton height="3rem" />
      ) : (
        movement &&
        neighbors.length > 0 && (
          <div className="ga-recap__strip" data-testid="movement-strip">
            <div className="ga-recap__strip-header">
              <span
                className={`ga-recap__direction ga-recap__direction--${movement.direction}`}
                data-testid="movement-direction"
              >
                {movementLabel(movement)}
              </span>
              {movement.prevRank !== null && movement.direction !== "none" && (
                <span className="ga-recap__from-to">
                  #{movement.prevRank} → #{movement.newRank}
                </span>
              )}
            </div>
            <div className="ga-recap__rows">
              {neighbors.map((entry) => (
                <StripRow
                  key={`${entry.entityType}:${entry.entityId}`}
                  entry={entry}
                  isSelf={entry.entityId === myChange?.entityId}
                  direction={movement.direction}
                />
              ))}
            </div>
          </div>
        )
      )}

      <Link
        className="ga-recap__board-link"
        to={`/leaderboards?game=${gameKey}`}
        data-testid="recap-view-leaderboard"
      >
        View full {gameNames[gameKey]} leaderboard →
      </Link>
    </Card>
  );
}

/** One row of the mini movement strip. Names stay clickable here too. */
function StripRow({
  entry,
  isSelf,
  direction,
}: {
  entry: LeaderboardEntry;
  isSelf: boolean;
  direction: RankMovement["direction"];
}): JSX.Element {
  const selfClass = isSelf ? ` ga-recap__row--self ga-recap__row--${direction}` : "";
  return (
    <div
      className={`ga-recap__row${selfClass}`}
      data-testid={isSelf ? "movement-row-self" : "movement-row"}
    >
      <span className="ga-recap__row-rank">#{entry.rank}</span>
      <UserLink
        name={entry.displayName}
        username={entry.username}
        modelId={entry.entityType === "ai" ? entry.entityId : undefined}
        type={entry.entityType}
        subtle={!isSelf}
      />
      <span className="ga-recap__row-rating">{Math.round(entry.rating)}</span>
    </div>
  );
}
