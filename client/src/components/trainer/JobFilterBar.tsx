import type { JSX } from "react";
import FilterBar from "../filters/FilterBar.tsx";
import SortSelect from "../filters/SortSelect.tsx";
import MultiToggle from "../filters/MultiToggle.tsx";
import DateRangePicker from "../filters/DateRangePicker.tsx";
import Toggle from "../filters/Toggle.tsx";
import {
  ALL_GAME_KEYS,
  defaultJobFilters,
  type JobFilters,
  type JobSort,
  type JobStatus,
  type TrainerGameKey,
} from "../../util/types.ts";
import { trainerGameNames } from "./trainerConsts.ts";

const SORT_OPTIONS: { value: JobSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "longest-running", label: "Longest running" },
  { value: "shortest-completed", label: "Shortest completed" },
  { value: "highest-reward", label: "Highest reward" },
  { value: "lowest-reward", label: "Lowest reward" },
];

const STATUS_OPTIONS: { value: JobStatus; label: string }[] = [
  { value: "queued", label: "Queued" },
  { value: "running", label: "Running" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "canceled", label: "Canceled" },
];

const GAME_OPTIONS = ALL_GAME_KEYS.map((g: TrainerGameKey) => ({
  value: g,
  label: trainerGameNames[g],
}));

interface JobFilterBarProps {
  filters: JobFilters;
  setFilter: <K extends keyof JobFilters>(key: K, value: JobFilters[K]) => void;
  setFilters: (next: Partial<JobFilters>) => void;
  onClear: () => void;
}

function activeCount(f: JobFilters): number {
  let n = 0;
  if (f.sort !== defaultJobFilters.sort) n++;
  if (f.statuses.length > 0) n++;
  if (f.games.length > 0) n++;
  if (f.hasCheckpoint) n++;
  if (f.date !== "all") n++;
  return n;
}

export default function JobFilterBar({
  filters,
  setFilter,
  setFilters,
  onClear,
}: JobFilterBarProps): JSX.Element {
  return (
    <FilterBar onClear={onClear} activeCount={activeCount(filters)} testId="filter-bar">
      <SortSelect
        value={filters.sort}
        options={SORT_OPTIONS}
        onChange={(v) => setFilter("sort", v)}
        testId="filter-sort"
      />
      <MultiToggle<JobStatus>
        label="Status"
        value={filters.statuses}
        options={STATUS_OPTIONS}
        onChange={(v) => setFilter("statuses", v)}
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
        label="Has checkpoint"
        checked={filters.hasCheckpoint}
        onChange={(v) => setFilter("hasCheckpoint", v)}
        testId="filter-has-checkpoint"
      />
      <DateRangePicker
        value={filters.date}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        onChange={(preset, from, to) => setFilters({ date: preset, dateFrom: from, dateTo: to })}
        testId="filter-date-range"
      />
    </FilterBar>
  );
}
