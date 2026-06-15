import "./Highlights.css";
import { type JSX } from "react";
import { Link } from "react-router-dom";
import useHighlights from "../hooks/useHighlights.ts";
import EmptyState from "../components/ui/EmptyState.tsx";
import ErrorState from "../components/ui/ErrorState.tsx";
import Skeleton from "../components/ui/Skeleton.tsx";
import TimeAgo from "../components/ui/TimeAgo.tsx";

/**
 * The broadcaster's bookmarked matches (Story 3.12): moments they highlighted
 * while broadcasting, newest first, each linking to the match's replay. A
 * snapshot fetched on mount.
 */
export default function Highlights(): JSX.Element {
  const { data, loading, error, refetch } = useHighlights();
  const highlights = data ?? [];

  return (
    <div className="ga-highlights" data-testid="highlights-page">
      <header className="ga-highlights__hero">
        <h1>Bookmarked matches</h1>
        <p>Moments you highlighted while broadcasting, saved for later.</p>
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
            <Skeleton key={i} variant="rect" height={84} />
          ))}
        </div>
      ) : highlights.length === 0 ? (
        <EmptyState
          icon="★"
          title="No highlights yet"
          body="Press Highlight while broadcasting a live match to bookmark the moment."
          action={
            <Link to="/live" className="ga-highlights__browse">
              Browse live games
            </Link>
          }
        />
      ) : (
        <ul className="ga-highlights__list" data-testid="highlights-list">
          {highlights.map((h) => (
            <li key={h.highlightId}>
              <Link to={`/replays/${h.gameId}`} className="ga-highlights__item">
                <span className="ga-highlights__star" aria-hidden="true">
                  ★
                </span>
                <span className="ga-highlights__body">
                  <span className="ga-highlights__note">{h.note || "Highlighted moment"}</span>
                  <TimeAgo date={h.capturedAt} className="ga-highlights__time" />
                </span>
                <span className="ga-highlights__cta">Watch replay →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
