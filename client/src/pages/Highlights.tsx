import "./Highlights.css";
import { type JSX } from "react";
import { Link } from "react-router-dom";
import useHighlights from "../hooks/useHighlights.ts";
import EmptyState from "../components/ui/EmptyState.tsx";
import ErrorState from "../components/ui/ErrorState.tsx";
import Skeleton from "../components/ui/Skeleton.tsx";
import TimeAgo from "../components/ui/TimeAgo.tsx";
import { replayGameNames } from "../util/consts.ts";

/**
 * The user's bookmarked highlights (Story 3.12): clips they saved while
 * watching a live broadcast or playing a game, newest first, each linking to
 * the match's replay. A snapshot fetched on mount.
 */
export default function Highlights(): JSX.Element {
  const { data, loading, error, refetch } = useHighlights();
  const highlights = data ?? [];

  return (
    <div className="ga-highlights" data-testid="highlights-page">
      <header className="ga-highlights__hero">
        <h1>Highlights</h1>
        <p>Clips you've saved from live games and matches you've played.</p>
      </header>

      {error ? (
        <ErrorState
          title="Could not load your highlights"
          body={error.message}
          retry={() => refetch()}
        />
      ) : loading && !data ? (
        <div className="ga-highlights__list" data-testid="highlights-skeleton">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="rect" height={72} />
          ))}
        </div>
      ) : highlights.length === 0 ? (
        <EmptyState
          icon="★"
          title="No highlights yet"
          body="Save a clip from a live game's Highlights panel, or press Highlight while playing a match."
          action={
            <Link to="/live" className="ga-highlights__browse">
              Browse live games
            </Link>
          }
        />
      ) : (
        <ul className="ga-highlights__list" data-testid="highlights-list">
          {highlights.map((h) => {
            // Highlights saved before the clip fields existed may lack
            // moves/startIndex/gameKey — default them so old records still render.
            const moveCount = h.moves?.length ?? 0;
            const gameName = h.gameKey ? replayGameNames[h.gameKey] : "Match";
            const watchTo =
              moveCount > 0
                ? `/replays/${h.gameId}?from=${h.startIndex ?? 0}&clip=${moveCount}`
                : `/replays/${h.gameId}`;
            return (
              <li key={h.highlightId}>
                <Link to={watchTo} className="ga-highlights__item">
                  <span className="ga-highlights__star" aria-hidden="true">
                    ★
                  </span>
                  <span className="ga-highlights__body">
                    <span className="ga-highlights__note">
                      {h.note || `${moveCount}-move clip`}
                    </span>
                    <span className="ga-highlights__time">
                      {gameName} (<TimeAgo date={h.capturedAt} />)
                    </span>
                  </span>
                  <span className="ga-highlights__cta">Watch replay →</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
