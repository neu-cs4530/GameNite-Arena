import type { JSX } from "react";
import FilterBar from "../filters/FilterBar.tsx";
import SortSelect from "../filters/SortSelect.tsx";
import MultiToggle from "../filters/MultiToggle.tsx";
import RangeSlider from "../filters/RangeSlider.tsx";
import DateRangePicker from "../filters/DateRangePicker.tsx";
import SearchInput from "../filters/SearchInput.tsx";
import Toggle from "../filters/Toggle.tsx";
import {
  ALL_GAME_KEYS,
  defaultModelFilters,
  type ModelFilters,
  type ModelOwnershipFilter,
  type ModelSort,
  type ModelVisibilityFilter,
  type TrainerGameKey,
  type TrainerTier,
} from "../../util/types.ts";
import { trainerGameNames } from "./trainerConsts.ts";

const SORT_OPTIONS: { value: ModelSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "highest-elo", label: "Highest Elo" },
  { value: "lowest-elo", label: "Lowest Elo" },
  { value: "most-forked", label: "Most forked" },
  { value: "best-win-rate", label: "Best win rate" },
  { value: "worst-win-rate", label: "Worst win rate" },
  { value: "most-matches", label: "Most matches played" },
  { value: "recently-trained", label: "Recently trained" },
];

const VIS_OPTIONS: { value: ModelVisibilityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "public", label: "Public only" },
  { value: "private", label: "Private only" },
];

const OWN_OPTIONS: { value: ModelOwnershipFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "yours", label: "Yours only" },
  { value: "others", label: "Others only" },
  { value: "forked-from-yours", label: "Forked from yours" },
];

const TIER_OPTIONS: { value: TrainerTier; label: string }[] = [
  { value: "bronze", label: "Bronze" },
  { value: "silver", label: "Silver" },
  { value: "gold", label: "Gold" },
  { value: "platinum", label: "Platinum" },
  { value: "diamond", label: "Diamond" },
];

const GAME_OPTIONS = ALL_GAME_KEYS.map((g: TrainerGameKey) => ({
  value: g,
  label: trainerGameNames[g],
}));

interface ModelFilterBarProps {
  filters: ModelFilters;
  setFilter: <K extends keyof ModelFilters>(key: K, value: ModelFilters[K]) => void;
  setFilters: (next: Partial<ModelFilters>) => void;
  onClear: () => void;
}

function activeCount(f: ModelFilters): number {
  let n = 0;
  if (f.sort !== defaultModelFilters.sort) n++;
  if (f.games.length > 0) n++;
  if (f.visibility !== "all") n++;
  if (f.ownership !== "all") n++;
  if (f.deployedOnly) n++;
  if (f.forkedOnly) n++;
  if (f.tiers.length > 0) n++;
  if (f.minElo !== defaultModelFilters.minElo) n++;
  if (f.maxElo !== defaultModelFilters.maxElo) n++;
  if (f.minWinRate !== defaultModelFilters.minWinRate) n++;
  if (f.maxWinRate !== defaultModelFilters.maxWinRate) n++;
  if (f.date !== "all") n++;
  if (f.ownerSearch) n++;
  if (f.hasCheckpoint) n++;
  return n;
}

export default function ModelFilterBar({
  filters,
  setFilter,
  setFilters,
  onClear,
}: ModelFilterBarProps): JSX.Element {
  return (
    <FilterBar
      onClear={onClear}
      activeCount={activeCount(filters)}
      testId="filter-bar"
      compactSummary={
        // Sort stays in the always-visible compact row (parity with the
        // replay filter bar) so reordering never requires opening the panel.
        <SortSelect
          value={filters.sort}
          options={SORT_OPTIONS}
          onChange={(v) => setFilter("sort", v)}
          testId="filter-sort"
        />
      }
    >
      <MultiToggle<TrainerGameKey>
        label="Game"
        value={filters.games}
        options={GAME_OPTIONS}
        onChange={(v) => setFilter("games", v)}
        testId="filter-game"
      />
      <MultiToggle<ModelVisibilityFilter>
        label="Visibility"
        value={[filters.visibility]}
        options={VIS_OPTIONS}
        singleSelect
        onChange={(v) => setFilter("visibility", v[0] ?? "all")}
        testId="filter-visibility"
      />
      <MultiToggle<ModelOwnershipFilter>
        label="Ownership"
        value={[filters.ownership]}
        options={OWN_OPTIONS}
        singleSelect
        onChange={(v) => setFilter("ownership", v[0] ?? "all")}
        testId="filter-ownership"
      />
      <Toggle
        label="Deployed only"
        checked={filters.deployedOnly}
        onChange={(v) => setFilter("deployedOnly", v)}
        testId="filter-deployed-only"
      />
      <Toggle
        label="Forked only"
        checked={filters.forkedOnly}
        onChange={(v) => setFilter("forkedOnly", v)}
        testId="filter-forked-only"
      />
      <MultiToggle<TrainerTier>
        label="Tier"
        value={filters.tiers}
        options={TIER_OPTIONS}
        onChange={(v) => setFilter("tiers", v)}
        testId="filter-tier"
      />
      <RangeSlider
        label="Elo range"
        min={800}
        max={2400}
        step={10}
        value={[filters.minElo, filters.maxElo]}
        onCommitLo={(v) => setFilter("minElo", v)}
        onCommitHi={(v) => setFilter("maxElo", v)}
        testId="filter-elo"
        containerTestId="filter-elo-range"
      />
      <RangeSlider
        label="Win-rate range"
        min={0}
        max={100}
        step={1}
        value={[filters.minWinRate, filters.maxWinRate]}
        onCommitLo={(v) => setFilter("minWinRate", v)}
        onCommitHi={(v) => setFilter("maxWinRate", v)}
        format={(n) => `${n}%`}
        testId="filter-winrate"
        containerTestId="filter-winrate-range"
      />
      <DateRangePicker
        value={filters.date}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        onChange={(preset, from, to) => setFilters({ date: preset, dateFrom: from, dateTo: to })}
        testId="filter-date-range"
      />
      <SearchInput
        label="Owner search"
        value={filters.ownerSearch}
        onChange={(v) => setFilter("ownerSearch", v)}
        placeholder="Username or display name"
        testId="filter-owner-search"
      />
      <Toggle
        label="Has checkpoint"
        checked={filters.hasCheckpoint}
        onChange={(v) => setFilter("hasCheckpoint", v)}
        testId="filter-has-checkpoint"
      />
    </FilterBar>
  );
}
