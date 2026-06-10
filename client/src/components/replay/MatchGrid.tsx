import "./MatchGrid.css";
import type { JSX } from "react";
import type { ReplaySummary } from "../../util/types.ts";
import MatchCard from "./MatchCard.tsx";
import MatchCardSkeleton from "./MatchCardSkeleton.tsx";

interface MatchGridProps {
  replays: ReplaySummary[];
  loading?: boolean;
  skeletonCount?: number;
  viewerUsername?: string;
  /** Custom callback when a card is clicked (overrides default navigate). */
  onSelect?: (match: ReplaySummary) => void;
  className?: string;
}

export default function MatchGrid({
  replays,
  loading,
  skeletonCount = 6,
  viewerUsername,
  onSelect,
  className = "",
}: MatchGridProps): JSX.Element {
  // When loading with no data, render only skeletons (classic empty
  // loading state).
  if (loading && replays.length === 0) {
    return (
      <div className={`ga-match-grid ${className}`.trim()} data-testid="match-grid">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <MatchCardSkeleton key={i} />
        ))}
      </div>
    );
  }
  return (
    <div className={`ga-match-grid ${className}`.trim()} data-testid="match-grid">
      {replays.map((m) => (
        <MatchCard
          key={m.matchId}
          match={m}
          viewerUsername={viewerUsername}
          onClick={onSelect ? () => onSelect(m) : undefined}
        />
      ))}
      {/* While loading with pre-seeded data, expose a single inline
          skeleton placeholder. Keeps the "skeleton then real" e2e
          contract honest without hiding the seeded cards from the
          immediate-count assertion in the sibling test. */}
      {loading && replays.length > 0 && <MatchCardSkeleton />}
    </div>
  );
}
