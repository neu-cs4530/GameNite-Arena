import "./GamesPortal.css";
import { useCallback, useState, type JSX } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { GameKey } from "@gamenite/shared";
import Badge from "../components/ui/Badge.tsx";
import Button from "../components/ui/Button.tsx";
import Disclosure from "../components/ui/Disclosure.tsx";
import EmptyState from "../components/ui/EmptyState.tsx";
import GameSelectGrid from "../components/ui/GameSelectGrid.tsx";
import RatingEmblem from "../components/ui/RatingEmblem.tsx";
import PageHero from "../components/ui/PageHero.tsx";
import Skeleton from "../components/ui/Skeleton.tsx";
import TimeAgo from "../components/ui/TimeAgo.tsx";
import { MultiToggle } from "../components/filters/index.ts";
import useAsync from "../hooks/useAsync.ts";
import useLoginContext from "../hooks/useLoginContext.ts";
import useQueueCounts from "../hooks/useQueueCounts.ts";
import { gameList } from "../services/gameService.ts";
import { fetchRating, inProgressGamesFor, queueTileLabel } from "../services/matchmakingService.ts";
import { PLAYABLE_GAME_KEYS, gameNames } from "../util/consts.ts";

type Mode = "casual" | "ranked";

/**
 * The matchmaking portal — the only way into a live game now that manual
 * game creation is gone. Built as a strict reveal sequence so the page is
 * one decision at a time:
 *
 *   pick a game  →  pick a mode  →  (ranked only: see your rating)  →  Play
 *
 * Below the launcher, one collapsed disclosure holds the user's unfinished
 * games — the reconnect path, since there is no lobby to return to.
 */
export default function GamesPortal(): JSX.Element {
  const { user } = useLoginContext();
  const navigate = useNavigate();
  const counts = useQueueCounts();

  const [selectedGame, setSelectedGame] = useState<GameKey | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [inProgressOpen, setInProgressOpen] = useState(false);

  // Ranked rating preview — only fetched once the user has actually asked
  // for ranked, and refetched per game so it can never show a stale game's
  // number.
  const wantRating = selectedGame !== null && mode === "ranked";
  const ratingResult = useAsync(
    useCallback(
      () => (wantRating ? fetchRating(selectedGame, user.username) : Promise.resolve(null)),
      [wantRating, selectedGame, user.username],
    ),
    [wantRating, selectedGame, user.username],
  );

  const gamesResult = useAsync(gameList, []);
  const inProgress = inProgressGamesFor(gamesResult.data ?? [], user.username);

  function selectGame(key: string) {
    // The grid only renders playable keys, so the assertion is safe.
    setSelectedGame(key as GameKey);
    setMode(null);
  }

  return (
    <div className="ga-portal" data-testid="games-portal">
      <PageHero title="Arena" lede="Pick a game, pick a mode — we find your opponent." />

      <GameSelectGrid
        games={PLAYABLE_GAME_KEYS.map((key) => ({ key, label: gameNames[key] }))}
        selectedKey={selectedGame}
        onSelect={selectGame}
        renderTileExtra={(key) => (
          <span data-testid={`queue-count-${key}`}>{queueTileLabel(counts[key as GameKey])}</span>
        )}
      />

      {selectedGame && (
        <div className="ga-portal__launch" data-testid="mode-chooser">
          <MultiToggle
            label="Mode"
            singleSelect
            options={[
              { value: "casual", label: "Casual" },
              { value: "ranked", label: "Ranked" },
            ]}
            value={mode ? [mode] : []}
            onChange={(next) => setMode(next[0] ?? null)}
            testId="mode-toggle"
          />

          {wantRating && (
            <div className="ga-portal__rating" data-testid="portal-rating">
              <span className="ga-portal__rating-label">Your {gameNames[selectedGame]} rating</span>
              {ratingResult.data ? (
                <RatingEmblem
                  rating={ratingResult.data.rating}
                  rd={ratingResult.data.rd}
                  gamesPlayed={ratingResult.data.gamesPlayed}
                  testId="portal-rating-emblem"
                />
              ) : ratingResult.error ? (
                <span className="ga-portal__rating-unavailable" data-testid="portal-rating-error">
                  Rating unavailable right now — you can still play.
                </span>
              ) : (
                <Skeleton variant="text" width="10rem" />
              )}
            </div>
          )}

          {mode && (
            <Button
              variant="primary"
              size="lg"
              onClick={() =>
                void navigate(`/games/queue/${selectedGame}?rated=${mode === "ranked"}`)
              }
              data-testid="play-button"
            >
              Play
            </Button>
          )}
        </div>
      )}

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
