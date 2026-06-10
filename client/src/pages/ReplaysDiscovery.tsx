import "./ReplaysDiscovery.css";
import type { JSX } from "react";
import useReplays from "../hooks/useReplays.ts";
import useReplayFilters from "../hooks/useReplayFilters.ts";

import Button from "../components/ui/Button.tsx";
import EmptyState from "../components/ui/EmptyState.tsx";
import ErrorState from "../components/ui/ErrorState.tsx";
import Pagination from "../components/ui/Pagination.tsx";

import ReplayFilterBar from "../components/filters/ReplayFilterBar.tsx";
import MatchCard from "../components/replay/MatchCard.tsx";
import MatchCardSkeleton from "../components/replay/MatchCardSkeleton.tsx";
import { defaultReplayFilters } from "../util/types.ts";

const DISCOVERY_PAGE_SIZE = 24;

/**
 * The pristine `/replays` state is the "Popular this week" preset:
 * `defaultReplayFilters.sort` + `.date` carry its expansion, and passing
 * them as the URL baseline means an empty query string (and "Clear all")
 * resolves to that preset.
 */
const discoveryDefaults = {
  sort: defaultReplayFilters.sort,
  date: defaultReplayFilters.date,
};

/**
 * Replay discovery: one filterable grid. The old featured strips ("Most
 * viewed today", "Trending now", ...) are now preset pills on the filter
 * bar that expand client-side into concrete filter values.
 */
export default function ReplaysDiscovery(): JSX.Element {
  const { filters, setFilter, setFilters, clearFilters } = useReplayFilters({
    pageSize: DISCOVERY_PAGE_SIZE,
    defaults: discoveryDefaults,
  });

  const { page, loading, error, refetch } = useReplays(filters);

  return (
    <div className="ga-discovery">
      <header className="ga-discovery__hero">
        <h1>Replays</h1>
        <p>Browse, study, and learn from every match GameNite Arena has ever played.</p>
      </header>

      <ReplayFilterBar
        filters={filters}
        setFilter={setFilter}
        setFilters={setFilters}
        onClear={clearFilters}
        showPresets
      />

      {error ? (
        <ErrorState title="Could not load replays" body={error.message} retry={() => refetch()} />
      ) : loading ? (
        <div className="ga-discovery__grid" data-testid="browse-grid-skeleton">
          {Array.from({ length: 12 }).map((_, i) => (
            <MatchCardSkeleton key={i} />
          ))}
        </div>
      ) : page && page.replays.length === 0 ? (
        <EmptyState
          icon="?"
          title="No replays match these filters"
          body="Try another preset, widen your Elo range, or clear a filter."
          action={<Button onClick={clearFilters}>Clear filters</Button>}
        />
      ) : page ? (
        <section className="ga-discovery__results" aria-label="Matching replays">
          <p className="ga-discovery__meta" data-testid="results-count">
            {page.total} {page.total === 1 ? "replay" : "replays"}
          </p>
          <div className="ga-discovery__grid" data-testid="browse-grid">
            {page.replays.map((m) => (
              <MatchCard key={m.matchId} match={m} />
            ))}
          </div>
          <PaginationFooter
            currentPage={filters.page}
            totalItems={page.total}
            pageSize={DISCOVERY_PAGE_SIZE}
            onPage={(p) => setFilter("page", p)}
          />
        </section>
      ) : null}
    </div>
  );
}

function PaginationFooter({
  currentPage,
  totalItems,
  pageSize,
  onPage,
}: {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPage: (p: number) => void;
}): JSX.Element {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return (
    <footer className="ga-discovery__pagination">
      <Pagination current={currentPage} total={totalPages} onChange={onPage} />
    </footer>
  );
}
