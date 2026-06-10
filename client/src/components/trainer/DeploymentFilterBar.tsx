import type { JSX } from "react";
import FilterBar from "../filters/FilterBar.tsx";
import SortSelect from "../filters/SortSelect.tsx";
import MultiToggle from "../filters/MultiToggle.tsx";
import Toggle from "../filters/Toggle.tsx";
import {
  ALL_GAME_KEYS,
  defaultDeploymentFilters,
  type DeploymentFilters,
  type DeploymentSort,
  type DeploymentStatus,
  type TrainerGameKey,
} from "../../util/types.ts";
import { trainerGameNames } from "./trainerConsts.ts";

const SORT_OPTIONS: { value: DeploymentSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "most-matches", label: "Most matches" },
  { value: "highest-elo", label: "Highest Elo" },
  { value: "recent-forfeits", label: "Recent forfeits" },
];

const STATUS_OPTIONS: { value: DeploymentStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "retired", label: "Retired" },
];

const GAME_OPTIONS = ALL_GAME_KEYS.map((g: TrainerGameKey) => ({
  value: g,
  label: trainerGameNames[g],
}));

interface DeploymentFilterBarProps {
  filters: DeploymentFilters;
  setFilter: <K extends keyof DeploymentFilters>(key: K, value: DeploymentFilters[K]) => void;
  setFilters: (next: Partial<DeploymentFilters>) => void;
  onClear: () => void;
}

function activeCount(f: DeploymentFilters): number {
  let n = 0;
  if (f.sort !== defaultDeploymentFilters.sort) n++;
  if (f.statuses.length > 0) n++;
  if (f.games.length > 0) n++;
  if (f.recentForfeits) n++;
  return n;
}

export default function DeploymentFilterBar({
  filters,
  setFilter,
  setFilters,
  onClear,
}: DeploymentFilterBarProps): JSX.Element {
  return (
    <FilterBar onClear={onClear} activeCount={activeCount(filters)} testId="filter-bar">
      <SortSelect
        value={filters.sort}
        options={SORT_OPTIONS}
        onChange={(v) => setFilter("sort", v)}
        testId="filter-sort"
      />
      <MultiToggle<DeploymentStatus>
        label="Status"
        value={filters.statuses}
        options={STATUS_OPTIONS}
        onChange={(v) => setFilters({ statuses: v })}
        testId="filter-status"
      />
      <MultiToggle<TrainerGameKey>
        label="Game"
        value={filters.games}
        options={GAME_OPTIONS}
        onChange={(v) => setFilter("games", v)}
        testId="filter-game"
      />
      <Toggle
        label="Recent forfeits"
        checked={filters.recentForfeits}
        onChange={(v) => setFilter("recentForfeits", v)}
        testId="filter-recent-forfeits"
      />
    </FilterBar>
  );
}
