import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { defaultReplayFilters } from "../../util/types.ts";
import { DEFAULT_REPLAY_PRESET_KEY } from "./replayPresets.ts";
import FilterPresetsBar from "./FilterPresetsBar.tsx";

describe("FilterPresetsBar", () => {
  it("marks the preset that matches the current filters as active", () => {
    render(<FilterPresetsBar filters={defaultReplayFilters} setFilters={vi.fn()} />);
    // The default filters correspond to the default preset.
    expect(screen.getByTestId(`filter-preset-${DEFAULT_REPLAY_PRESET_KEY}`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("applies a preset's filter changes when an inactive pill is clicked", () => {
    const setFilters = vi.fn();
    render(<FilterPresetsBar filters={defaultReplayFilters} setFilters={setFilters} />);

    fireEvent.click(screen.getByTestId("filter-preset-newest"));
    expect(setFilters).toHaveBeenCalledOnce();
  });

  it("does nothing when the already-active pill is clicked (radio semantics)", () => {
    const setFilters = vi.fn();
    render(<FilterPresetsBar filters={defaultReplayFilters} setFilters={setFilters} />);

    fireEvent.click(screen.getByTestId(`filter-preset-${DEFAULT_REPLAY_PRESET_KEY}`));
    expect(setFilters).not.toHaveBeenCalled();
  });
});
