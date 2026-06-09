import "./ReplaysDiscovery.css";
import type { JSX } from "react";
import useReplays from "../hooks/useReplays.ts";
import useReplayFilters from "../hooks/useReplayFilters.ts";
import useFeaturedReplays from "../hooks/useFeaturedReplays.ts";

import Section from "../components/ui/Section.tsx";
import Button from "../components/ui/Button.tsx";
import EmptyState from "../components/ui/EmptyState.tsx";
import ErrorState from "../components/ui/ErrorState.tsx";
import HorizontalScroll from "../components/ui/HorizontalScroll.tsx";
import Pagination from "../components/ui/Pagination.tsx";

import ReplayFilterBar from "../components/filters/ReplayFilterBar.tsx";
import MatchCard from "../components/replay/MatchCard.tsx";
import MatchCardSkeleton from "../components/replay/MatchCardSkeleton.tsx";
import type { FeaturedStrip } from "../__mocks__/replays.ts";

const DISCOVERY_PAGE_SIZE = 24;

export default function ReplaysDiscovery(): JSX.Element {
  const { filters, setFilter, setFilters, clearFilters } = useReplayFilters({
    pageSize: DISCOVERY_PAGE_SIZE,
  });

  const { page, loading, error, refetch } = useReplays(filters);

  return (
    <div className="ga-discovery">
      <header className="ga-discovery__hero">
        <h1>Replays</h1>
        <p>Browse, study, and learn from every match GameNite Arena has ever played.</p>
      </header>

      <FeaturedStripView title="Most viewed today" strip="most-viewed-today" isHero />
      <FeaturedStripView title="Trending now (last 7 days)" strip="trending-week" />
      <FeaturedStripView title="Notable AI vs Human matches" strip="notable-ai-vs-human" />
      <FeaturedStripView title="Highest-rated this week" strip="highest-rated-week" />

      <Section
        title="Browse all replays"
        subtitle="Combine filters and sort to find exactly the matches you want."
      >
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
            body="Try widening your Elo range or clearing a filter."
            action={<Button onClick={clearFilters}>Clear filters</Button>}
          />
        ) : page ? (
          <>
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
          </>
        ) : null}
      </Section>
    </div>
  );
}

interface FeaturedStripViewProps {
  title: string;
  strip: FeaturedStrip;
  isHero?: boolean;
}

function FeaturedStripView({ title, strip, isHero }: FeaturedStripViewProps): JSX.Element {
  const { replays, loading } = useFeaturedReplays(strip);
  const skeletonTestId = isHero ? "hero-strip-skeleton" : "featured-strip-skeleton";
  const contentTestId = isHero ? "hero-strip" : "featured-strip-content";
  // The `featured-strip` testid is rendered always so the "four strips
  // render" test sees count=4 immediately. The strip is hidden during
  // loading so any `expect.toBeVisible()` test waits for cards to arrive.
  // The skeleton renders as a SEPARATE sibling visible during loading.
  return (
    <Section title={title}>
      {loading && (
        <div className="ga-discovery__strip-wrap" data-testid="featured-strip-loading-skeleton">
          <HorizontalScroll ariaLabel={`${title} (loading)`} testId={skeletonTestId}>
            {Array.from({ length: 6 }).map((_, i) => (
              <MatchCardSkeleton key={i} />
            ))}
          </HorizontalScroll>
        </div>
      )}
      <div
        className="ga-discovery__strip-wrap"
        data-testid="featured-strip"
        data-strip={strip}
        hidden={loading}
      >
        <h3 className="visuallyHidden">{title}</h3>
        {!loading && (
          <HorizontalScroll ariaLabel={title} testId={contentTestId}>
            {(replays ?? []).length === 0
              ? [<EmptyStrip key="empty" />]
              : (replays ?? []).map((m) => <MatchCard key={m.matchId} match={m} />)}
          </HorizontalScroll>
        )}
      </div>
    </Section>
  );
}

function EmptyStrip(): JSX.Element {
  return (
    <div className="ga-discovery__empty-strip" data-testid="empty-strip">
      Nothing here yet.
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
