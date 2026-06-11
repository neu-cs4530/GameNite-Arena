import "./ModelsBrowse.css";
import { useCallback, type JSX } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/ui/Button.tsx";
import EmptyState from "../components/ui/EmptyState.tsx";
import ErrorState from "../components/ui/ErrorState.tsx";
import HorizontalScroll from "../components/ui/HorizontalScroll.tsx";
import Pagination from "../components/ui/Pagination.tsx";
import Section from "../components/ui/Section.tsx";
import { ModelCard, ModelCardSkeleton, ModelFilterBar } from "../components/trainer/index.ts";
import useAsync from "../hooks/useAsync.ts";
import useLoginContext from "../hooks/useLoginContext.ts";
import useModelFilters from "../hooks/useModelFilters.ts";
import useModels from "../hooks/useModels.ts";
import {
  listRecentlyForkedModels,
  listStarterTemplateModels,
  listTopModelsPerGame,
} from "../services/modelService.ts";
import type { ModelSummary } from "../util/types.ts";

const PAGE_SIZE = 24;

export default function ModelsBrowse(): JSX.Element {
  const navigate = useNavigate();
  const { user } = useLoginContext();
  const { filters, setFilter, setFilters, clearFilters } = useModelFilters({
    pageSize: PAGE_SIZE,
    viewerUsername: user.username,
  });
  const { page, loading, error, refetch } = useModels(filters);

  return (
    <div className="ga-models-browse" data-testid="models-browse">
      <header className="ga-models-browse__hero">
        <div>
          <h1>Models</h1>
          <p>Browse, fork, and deploy any public model trained on GameNite Arena.</p>
        </div>
        <Button
          variant="primary"
          onClick={() => void navigate("/trainer/new")}
          data-testid="new-training-run-cta"
        >
          New training run
        </Button>
      </header>

      <FeaturedStripView
        title="Top models per game"
        loader={listTopModelsPerGame}
        testIdSuffix="top-per-game"
        isHero
      />
      <FeaturedStripView
        title="Recently forked"
        loader={listRecentlyForkedModels}
        testIdSuffix="recently-forked"
      />
      <FeaturedStripView
        title="Hello world starters"
        loader={listStarterTemplateModels}
        testIdSuffix="starters"
      />

      <Section
        title="Browse all models"
        subtitle="Filter and sort to find exactly the model you want."
        testId="models-browse-all"
      >
        <ModelFilterBar
          filters={filters}
          setFilter={setFilter}
          setFilters={setFilters}
          onClear={clearFilters}
        />

        {error ? (
          <>
            <ErrorState
              title="Could not load models"
              body={error.message}
              retry={() => refetch()}
            />
            <Button variant="secondary" onClick={() => refetch()}>
              Retry
            </Button>
          </>
        ) : loading ? (
          <div className="ga-models-browse__grid" data-testid="browse-grid-skeleton">
            {Array.from({ length: 12 }).map((_, i) => (
              <ModelCardSkeleton key={i} />
            ))}
          </div>
        ) : page && page.models.length === 0 ? (
          <EmptyState
            title="No models match these filters"
            body="Try widening your Elo range or clearing a filter."
            action={
              <Button onClick={clearFilters} data-testid="empty-clear-filters">
                Clear filters
              </Button>
            }
          />
        ) : page ? (
          <>
            <div className="ga-models-browse__grid" data-testid="browse-grid">
              {page.models.map((m) => (
                <ModelCard key={m.id} model={m} />
              ))}
            </div>
            <PaginationFooter
              currentPage={filters.page}
              totalItems={page.total}
              pageSize={PAGE_SIZE}
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
  loader: () => Promise<ModelSummary[]>;
  testIdSuffix: string;
  isHero?: boolean;
}

function FeaturedStripView({
  title,
  loader,
  testIdSuffix,
  isHero,
}: FeaturedStripViewProps): JSX.Element {
  const producer = useCallback(() => loader(), [loader]);
  const { data: models, loading } = useAsync<ModelSummary[]>(producer, [loader]);

  const skeletonId = isHero ? "hero-strip-skeleton" : "featured-strip-skeleton";
  return (
    <Section title={title} testId={`featured-strip-section-${testIdSuffix}`}>
      {loading && (
        <div className="ga-models-browse__strip-wrap">
          <HorizontalScroll ariaLabel={`${title} (loading)`} testId={skeletonId}>
            {Array.from({ length: 6 }).map((_, i) => (
              <ModelCardSkeleton key={i} />
            ))}
          </HorizontalScroll>
        </div>
      )}
      <div
        className="ga-models-browse__strip-wrap"
        data-testid="featured-strip"
        data-strip={testIdSuffix}
        hidden={loading}
      >
        <h3 className="visuallyHidden">{title}</h3>
        {!loading && (
          <HorizontalScroll ariaLabel={title}>
            {(models ?? []).length === 0 ? (
              <span className="ga-models-browse__empty-strip">Nothing here yet.</span>
            ) : (
              (models ?? []).map((m) => <ModelCard key={m.id} model={m} />)
            )}
          </HorizontalScroll>
        )}
      </div>
    </Section>
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
    <footer className="ga-models-browse__pagination">
      <Pagination current={currentPage} total={totalPages} onChange={onPage} />
    </footer>
  );
}
