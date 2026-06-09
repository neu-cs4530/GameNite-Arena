import "./FilterPresetsBar.css";
import type { JSX } from "react";
import type { ReplayFilters } from "../../util/types.ts";

interface FilterPresetsBarProps {
  filters: ReplayFilters;
  setFilters: (next: Partial<ReplayFilters>) => void;
}

/**
 * Filter presets — one-click filter combos surfaced above the regular
 * FilterBar. Tied to the test agent's contract:
 *  - "Popular today" sets sort=most-viewed and date=today.
 *  - "AI vs AI" sets participantType=ais (URL value).
 *  - "Upset matches" sets preset=upsets; the mock layer matches replays
 *     where the lower-Elo participant won by a margin.
 */
export default function FilterPresetsBar({
  filters,
  setFilters,
}: FilterPresetsBarProps): JSX.Element {
  const popularActive = filters.sort === "most-viewed" && filters.date === "today";
  const aiVsAiActive = filters.participantType === "ais";
  const upsetActive = filters.preset === "upsets";

  return (
    <div
      className="ga-filter-presets"
      role="toolbar"
      aria-label="Filter presets"
      data-testid="filter-presets"
    >
      <button
        type="button"
        className={`ga-filter-presets__btn ${popularActive ? "ga-filter-presets__btn--active" : ""}`}
        onClick={() => {
          if (popularActive) setFilters({ sort: "newest", date: "all" });
          else setFilters({ sort: "most-viewed", date: "today" });
        }}
        aria-pressed={popularActive}
      >
        Popular today
      </button>
      <button
        type="button"
        className={`ga-filter-presets__btn ${aiVsAiActive ? "ga-filter-presets__btn--active" : ""}`}
        onClick={() => {
          setFilters({ participantType: aiVsAiActive ? "all" : "ais" });
        }}
        aria-pressed={aiVsAiActive}
      >
        AI vs AI
      </button>
      <button
        type="button"
        className={`ga-filter-presets__btn ${upsetActive ? "ga-filter-presets__btn--active" : ""}`}
        onClick={() => {
          setFilters({ preset: upsetActive ? undefined : "upsets" });
        }}
        aria-pressed={upsetActive}
      >
        Upset matches
      </button>
    </div>
  );
}
