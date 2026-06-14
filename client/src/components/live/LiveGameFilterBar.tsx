import "./LiveGameFilterBar.css";
import type { JSX } from "react";
import type { GameKey } from "@gamenite/shared";
import MultiToggle from "../filters/MultiToggle.tsx";
import RangeSlider from "../filters/RangeSlider.tsx";
import SortSelect from "../filters/SortSelect.tsx";
import Button from "../ui/Button.tsx";
import {
  LIVE_ELO_MAX,
  LIVE_ELO_MIN,
  defaultLiveFilters,
  type LiveGameFilters,
  type LiveGameSort,
} from "../../util/liveGames.ts";

const GAME_OPTIONS: { value: GameKey; label: string }[] = [
  { value: "nim", label: "Nim" },
  { value: "guess", label: "Number Guesser" },
  { value: "tictactoe", label: "Tic-Tac-Toe" },
  { value: "connect4", label: "Connect 4" },
  { value: "checkers", label: "Checkers" },
];

const SORT_OPTIONS: { value: LiveGameSort; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "oldest", label: "Oldest" },
  { value: "highest-elo", label: "Highest Elo" },
  { value: "lowest-elo", label: "Lowest Elo" },
];

interface LiveGameFilterBarProps {
  filters: LiveGameFilters;
  setFilters: (next: LiveGameFilters) => void;
}

/** Filter live games by game type + Elo band, sorted by recency or Elo. */
export default function LiveGameFilterBar({
  filters,
  setFilters,
}: LiveGameFilterBarProps): JSX.Element {
  function set<K extends keyof LiveGameFilters>(key: K, value: LiveGameFilters[K]): void {
    setFilters({ ...filters, [key]: value });
  }
  const dirty = JSON.stringify(filters) !== JSON.stringify(defaultLiveFilters);

  return (
    <div className="ga-live-filters" data-testid="live-filter-bar">
      <SortSelect<LiveGameSort>
        label="Sort"
        value={filters.sort}
        options={SORT_OPTIONS}
        onChange={(v) => set("sort", v)}
        testId="live-sort"
      />
      <MultiToggle<GameKey>
        label="Game"
        value={filters.games}
        options={GAME_OPTIONS}
        onChange={(v) => set("games", v)}
        testId="live-games"
      />
      <RangeSlider
        label="Elo range"
        min={LIVE_ELO_MIN}
        max={LIVE_ELO_MAX}
        step={10}
        value={[filters.minElo, filters.maxElo]}
        onCommitLo={(v) => set("minElo", v)}
        onCommitHi={(v) => set("maxElo", v)}
        format={(n) => `Elo ${n}`}
        testId="live-elo"
      />
      {dirty && (
        <Button variant="ghost" size="sm" onClick={() => setFilters(defaultLiveFilters)}>
          Clear
        </Button>
      )}
    </div>
  );
}
