import "./GamesPortal.css";
import { useState, type JSX } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { GameKey } from "@gamenite/shared";
import Badge from "../components/ui/Badge.tsx";
import Disclosure from "../components/ui/Disclosure.tsx";
import EmptyState from "../components/ui/EmptyState.tsx";
import GameSelectGrid from "../components/ui/GameSelectGrid.tsx";
import PageHero from "../components/ui/PageHero.tsx";
import TimeAgo from "../components/ui/TimeAgo.tsx";
import useAsync from "../hooks/useAsync.ts";
import useLoginContext from "../hooks/useLoginContext.ts";
import useQueueCounts from "../hooks/useQueueCounts.ts";
import { gameList } from "../services/gameService.ts";
import { inProgressGamesFor, queueTileLabel } from "../services/matchmakingService.ts";
import { PLAYABLE_GAME_KEYS, gameNames } from "../util/consts.ts";

/**
 * The games portal is now just the door: each tile opens that game's
 * section page (/games/:gameKey), where the Play CTAs, seat choice, stats,
 * and board live. Tiles keep their live queue counts, and the collapsed
 * disclosure below still holds the user's unfinished games — the reconnect
 * path, since there is no lobby to return to.
 */
export default function GamesPortal(): JSX.Element {
  const { user } = useLoginContext();
  const navigate = useNavigate();
  const counts = useQueueCounts();

  const [inProgressOpen, setInProgressOpen] = useState(false);

  const gamesResult = useAsync(gameList, []);
  const inProgress = inProgressGamesFor(gamesResult.data ?? [], user.username);

  return (
    <div className="ga-portal" data-testid="games-portal">
      <PageHero title="Arena" lede="Pick a game — play it yourself or send your model in." />

      <GameSelectGrid
        games={PLAYABLE_GAME_KEYS.map((key) => ({ key, label: gameNames[key] }))}
        onSelect={(key) => void navigate(`/games/${key}`)}
        renderTileExtra={(key) => (
          <span data-testid={`queue-count-${key}`}>{queueTileLabel(counts[key as GameKey])}</span>
        )}
      />

      <Disclosure
        summary="Your games in progress"
        meta={<span className="ga-portal__count">{inProgress.length}</span>}
        open={inProgressOpen}
        onToggle={setInProgressOpen}
        testId="games-in-progress"
      >
        {inProgress.length === 0 ? (
          <EmptyState
            title="Nothing in progress"
            body="Matches you get queued into will appear here until they finish."
            testId="in-progress-empty"
          />
        ) : (
          <div className="ga-portal__rows" data-testid="in-progress-list">
            {inProgress.map((game) => (
              <div key={game.gameId} className="ga-portal__row">
                <Link to={`/game/${game.gameId}`} className="ga-portal__row-link">
                  A game of {gameNames[game.type]}
                </Link>
                <Badge variant={game.status === "active" ? "live" : "default"}>{game.status}</Badge>
                <span className="ga-portal__row-spacer" />
                <TimeAgo date={game.createdAt} />
              </div>
            ))}
          </div>
        )}
      </Disclosure>
    </div>
  );
}
