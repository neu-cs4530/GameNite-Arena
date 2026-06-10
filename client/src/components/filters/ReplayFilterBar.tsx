import { useMemo, type JSX } from "react";
import FilterBar from "./FilterBar.tsx";
import SortSelect from "./SortSelect.tsx";
import MultiToggle from "./MultiToggle.tsx";
import RangeSlider from "./RangeSlider.tsx";
import DateRangePicker from "./DateRangePicker.tsx";
import SearchInput from "./SearchInput.tsx";
import Toggle from "./Toggle.tsx";
import FilterPresetsBar from "./FilterPresetsBar.tsx";
import {
  DEFAULT_REPLAY_PRESET_KEY,
  matchReplayPreset,
  type ReplayPresetDef,
} from "./replayPresets.ts";
import type {
  DateRangePreset,
  ParticipantType,
  ReplayFilters,
  ReplayGameKey,
  ReplaySort,
  ResultFilter,
} from "../../util/types.ts";
import { ALL_GAME_KEYS, defaultReplayFilters } from "../../util/types.ts";
import { replayGameNames } from "../../util/consts.ts";

interface ReplayFilterBarProps {
  filters: ReplayFilters;
  setFilter: <K extends keyof ReplayFilters>(key: K, value: ReplayFilters[K]) => void;
  setFilters: (next: Partial<ReplayFilters>) => void;
  onClear: () => void;
  /**
   * Show the always-visible preset pill row above the header. Also switches
   * the chips / count baseline to the preset defaults (`defaultReplayFilters`,
   * i.e. "Popular this week"); without it the baseline stays the neutral
   * newest / all-time used by user-scoped lists.
   */
  showPresets?: boolean;
}

const SORT_OPTIONS: { value: ReplaySort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "most-viewed", label: "Most viewed" },
  { value: "fewest-viewed", label: "Fewest viewed" },
  { value: "longest", label: "Longest" },
  { value: "shortest", label: "Shortest" },
  { value: "highest-elo", label: "Highest Elo" },
  { value: "lowest-elo", label: "Lowest Elo" },
];

const PARTICIPANT_TYPE_OPTIONS: { value: ParticipantType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "humans", label: "Humans" },
  { value: "ais", label: "AIs" },
  { value: "mixed", label: "Mixed" },
];

const RESULT_OPTIONS: { value: ResultFilter; label: string }[] = [
  { value: "wins", label: "Wins" },
  { value: "losses", label: "Losses" },
  { value: "draws", label: "Draws" },
  { value: "abandoned", label: "Abandoned" },
  { value: "forfeit", label: "Forfeit" },
];

const GAME_OPTIONS = ALL_GAME_KEYS.map((g: ReplayGameKey) => ({
  value: g,
  label: replayGameNames[g],
}));

const dateLabels: Record<DateRangePreset, string> = {
  all: "All time",
  today: "Today",
  week: "This week",
  month: "This month",
  year: "This year",
  custom: "Custom",
};

interface Chip {
  key: string;
  label: string;
  onRemove: () => void;
}

function buildChips(
  filters: ReplayFilters,
  setFilter: ReplayFilterBarProps["setFilter"],
  setFilters: ReplayFilterBarProps["setFilters"],
  activePreset: ReplayPresetDef | undefined,
): Chip[] {
  const chips: Chip[] = [];
  if (filters.games.length > 0) {
    const label = filters.games.map((g) => replayGameNames[g]).join(", ");
    chips.push({
      key: "games",
      label: `Game: ${label}`,
      onRemove: () => setFilter("games", []),
    });
  }
  // Participant type, date and the "upsets" flag are preset-controlled: when
  // a preset is active it fully explains them (the matching requires
  // equality), so the pill communicates the state and no chip is shown.
  if (filters.participantType !== "all" && !activePreset) {
    const opt = PARTICIPANT_TYPE_OPTIONS.find((o) => o.value === filters.participantType);
    chips.push({
      key: "participant",
      label: opt ? opt.label : filters.participantType,
      onRemove: () => setFilter("participantType", "all"),
    });
  }
  if (filters.results.length > 0) {
    const label = filters.results.map((r) => r.charAt(0).toUpperCase() + r.slice(1)).join(", ");
    chips.push({
      key: "results",
      label: `Result: ${label}`,
      onRemove: () => setFilter("results", []),
    });
  }
  const eloChanged =
    filters.minElo !== defaultReplayFilters.minElo ||
    filters.maxElo !== defaultReplayFilters.maxElo;
  if (eloChanged) {
    chips.push({
      key: "elo",
      label: `Elo ${filters.minElo}–${filters.maxElo}`,
      onRemove: () =>
        setFilters({
          minElo: defaultReplayFilters.minElo,
          maxElo: defaultReplayFilters.maxElo,
        }),
    });
  }
  if (filters.date !== "all" && !activePreset) {
    chips.push({
      key: "date",
      label: dateLabels[filters.date] ?? filters.date,
      onRemove: () => setFilters({ date: "all", dateFrom: undefined, dateTo: undefined }),
    });
  }
  const movesChanged =
    filters.minMoves !== defaultReplayFilters.minMoves ||
    filters.maxMoves !== defaultReplayFilters.maxMoves;
  if (movesChanged) {
    chips.push({
      key: "moves",
      label: `${filters.minMoves}–${filters.maxMoves} moves`,
      onRemove: () =>
        setFilters({
          minMoves: defaultReplayFilters.minMoves,
          maxMoves: defaultReplayFilters.maxMoves,
        }),
    });
  }
  if (filters.participantSearch) {
    chips.push({
      key: "search",
      label: `“${filters.participantSearch}”`,
      onRemove: () => setFilter("participantSearch", ""),
    });
  }
  if (filters.ratedOnly) {
    chips.push({
      key: "rated",
      label: "Rated only",
      onRemove: () => setFilter("ratedOnly", false),
    });
  }
  if (filters.preset === "upsets" && !activePreset) {
    // Leftover "upsets" flag after the Upsets pill was deselected by another
    // filter change — surface it so the state stays visible and removable.
    chips.push({
      key: "upsets",
      label: "Upsets",
      onRemove: () => setFilter("preset", undefined),
    });
  }
  return chips;
}

function activeCount(chips: Chip[], sortChanged: boolean): number {
  return chips.length + (sortChanged ? 1 : 0);
}

/**
 * Concrete filter bar implementation that wires the per-control primitives
 * to the `ReplayFilters` shape. The Sort dropdown lives in the always-visible
 * header alongside chips for every active filter; the rest of the controls
 * collapse behind the Filters toggle.
 */
export default function ReplayFilterBar({
  filters,
  setFilter,
  setFilters,
  onClear,
  showPresets,
}: ReplayFilterBarProps): JSX.Element {
  // With presets, the active pill is derived from the filters and explains
  // the preset-controlled fields; the sort baseline is the default preset's
  // sort. Without presets (user-scoped lists) the neutral "newest" baseline
  // applies and no preset matching happens.
  const activePreset = showPresets ? matchReplayPreset(filters) : undefined;
  const baselineSort: ReplaySort = showPresets ? defaultReplayFilters.sort : "newest";

  const chips = useMemo(
    () => buildChips(filters, setFilter, setFilters, activePreset),
    [filters, setFilter, setFilters, activePreset],
  );
  const sortChanged = !activePreset && filters.sort !== baselineSort;
  const count = activeCount(chips, sortChanged);
  // Pristine default = default preset active with nothing else applied;
  // everywhere else "Clear all" must offer the way back to that default.
  const pristineDefault = activePreset?.key === DEFAULT_REPLAY_PRESET_KEY && count === 0;

  return (
    <FilterBar
      onClear={onClear}
      activeCount={count}
      clearable={showPresets ? !pristineDefault : undefined}
      compactSummary={
        <>
          <SortSelect
            value={filters.sort}
            options={SORT_OPTIONS}
            onChange={(v) => setFilter("sort", v)}
          />
          {chips.length > 0 ? (
            <ul className="ga-filter-chips" aria-label="Active filters">
              {chips.map((c) => (
                <li key={c.key} className="ga-filter-chip">
                  <span className="ga-filter-chip__label">{c.label}</span>
                  <button
                    type="button"
                    className="ga-filter-chip__remove"
                    aria-label={`Remove ${c.label} filter`}
                    onClick={c.onRemove}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      }
      presets={
        showPresets ? <FilterPresetsBar filters={filters} setFilters={setFilters} /> : undefined
      }
    >
      <MultiToggle<ReplayGameKey>
        label="Game"
        value={filters.games}
        options={GAME_OPTIONS}
        onChange={(v) => setFilter("games", v)}
        testId="filter-game"
      />
      <MultiToggle<ParticipantType>
        label="Participant type"
        value={[filters.participantType]}
        options={PARTICIPANT_TYPE_OPTIONS}
        singleSelect
        onChange={(v) => setFilter("participantType", v[0] ?? "all")}
        testId="filter-participant-type"
      />
      <MultiToggle<ResultFilter>
        label="Result"
        value={filters.results}
        options={RESULT_OPTIONS}
        onChange={(v) => setFilter("results", v)}
        testId="filter-result"
      />
      <RangeSlider
        label="Elo range"
        min={800}
        max={2400}
        step={10}
        value={[filters.minElo, filters.maxElo]}
        onChange={(next) => setFilters({ minElo: next[0], maxElo: next[1] })}
        testId="filter-elo"
      />
      <DateRangePicker
        value={filters.date}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        onChange={(preset, from, to) => setFilters({ date: preset, dateFrom: from, dateTo: to })}
      />
      <RangeSlider
        label="Move count"
        min={1}
        max={200}
        step={1}
        value={[filters.minMoves, filters.maxMoves]}
        onChange={(next) => setFilters({ minMoves: next[0], maxMoves: next[1] })}
        testId="filter-move-count"
        containerTestId="filter-move-count"
      />
      <SearchInput
        label="Search participants"
        value={filters.participantSearch}
        onChange={(v) => setFilter("participantSearch", v)}
        placeholder="Bot, Yáo, RookieBot..."
        testId="filter-participant-search"
      />
      <Toggle
        label="Rated only"
        checked={filters.ratedOnly}
        onChange={(v) => setFilter("ratedOnly", v)}
        testId="filter-rated-only"
      />
    </FilterBar>
  );
}
