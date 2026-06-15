import "./LiveGamesDashboard.css";
import { useMemo, useState, type JSX } from "react";
import useLiveBroadcasts from "../hooks/useLiveBroadcasts.ts";
import {
  defaultLiveFilters,
  filterAndSortLiveGames,
  type LiveGameFilters,
} from "../util/liveGames.ts";
import LiveGameFilterBar from "../components/live/LiveGameFilterBar.tsx";
import LiveGameCard from "../components/live/LiveGameCard.tsx";
import EmptyState from "../components/ui/EmptyState.tsx";
import ErrorState from "../components/ui/ErrorState.tsx";
import Skeleton from "../components/ui/Skeleton.tsx";

/**
 * Live games discovery: every in-progress game someone is broadcasting,
 * filterable by game type and Elo and sortable by recency/Elo. Modeled on the
 * replay discovery page, but real-only — when nobody is broadcasting it shows
 * an honest empty state, never fixture data.
 */
export default function LiveGamesDashboard(): JSX.Element {
  const { data, loading, error, refetch } = useLiveBroadcasts();
  const [filters, setFilters] = useState<LiveGameFilters>(defaultLiveFilters);

  const rows = useMemo(() => filterAndSortLiveGames(data ?? [], filters), [data, filters]);
  const totalLive = data?.length ?? 0;

  return (
    <div className="ga-live-dash" data-testid="live-dashboard">
      <header className="ga-live-dash__hero">
        <h1>Live Games</h1>
        <p>Watch games in progress, right now.</p>
      </header>

      <LiveGameFilterBar filters={filters} setFilters={setFilters} />

      {error ? (
        <ErrorState
          title="Could not load live games"
          body={error.message}
          retry={() => refetch()}
        />
      ) : loading && totalLive === 0 ? (
        <div className="ga-live-dash__grid" data-testid="live-grid-skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="rect" height={150} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="📺"
          title={totalLive === 0 ? "No live games right now" : "No live games match these filters"}
          body={
            totalLive === 0
              ? "When someone broadcasts a game in progress, it'll appear here."
              : "Try widening your Elo range or clearing the game filter."
          }
        />
      ) : (
        <section className="ga-live-dash__results" aria-label="Live games">
          <p className="ga-live-dash__meta" data-testid="live-results-count">
            {rows.length} live {rows.length === 1 ? "game" : "games"}
          </p>
          <div className="ga-live-dash__grid" data-testid="live-grid">
            {rows.map((r) => (
              <LiveGameCard key={r.broadcast.broadcastId} row={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
