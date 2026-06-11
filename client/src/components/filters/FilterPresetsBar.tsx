import "./FilterPresetsBar.css";
import type { JSX } from "react";
import type { ReplayFilters } from "../../util/types.ts";
import { REPLAY_PRESETS, matchReplayPreset, presetToFilterChanges } from "./replayPresets.ts";

interface FilterPresetsBarProps {
  filters: ReplayFilters;
  setFilters: (next: Partial<ReplayFilters>) => void;
}

/**
 * Single-select preset pill row for the replay discovery feed. Always
 * visible above the FilterBar header (see `FilterBar`'s `presets` slot).
 *
 * Selecting a pill expands client-side into concrete filter values (sort /
 * date / participant type, plus the "upsets" mock flag) and overwrites those
 * fields; the active pill is *derived* from the current filters, so manually
 * changing any preset-controlled filter deselects it. Re-clicking the active
 * pill is a no-op (radio semantics). Orthogonal filters (game, Elo, etc.)
 * compose with the active preset.
 */
export default function FilterPresetsBar({
  filters,
  setFilters,
}: FilterPresetsBarProps): JSX.Element {
  const active = matchReplayPreset(filters);

  return (
    <div
      className="ga-filter-presets"
      role="toolbar"
      aria-label="Filter presets"
      data-testid="filter-presets"
    >
      {REPLAY_PRESETS.map((p) => {
        const isActive = active?.key === p.key;
        return (
          <button
            key={p.key}
            type="button"
            className={`ga-filter-presets__btn ${isActive ? "ga-filter-presets__btn--active" : ""}`.trim()}
            onClick={() => {
              if (!isActive) setFilters(presetToFilterChanges(p));
            }}
            aria-pressed={isActive}
            title={p.description}
            data-testid={`filter-preset-${p.key}`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
