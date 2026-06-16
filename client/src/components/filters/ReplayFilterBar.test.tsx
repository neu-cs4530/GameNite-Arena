import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { defaultReplayFilters, type ReplayFilters } from "../../util/types.ts";
import ReplayFilterBar from "./ReplayFilterBar.tsx";

// Build a filters object from the defaults with a few fields overridden.
function makeFilters(overrides: Partial<ReplayFilters>): ReplayFilters {
  return { ...defaultReplayFilters, sort: "newest", date: "all", ...overrides };
}

function renderBar(filters: ReplayFilters) {
  const setFilter = vi.fn();
  const setFilters = vi.fn();
  const onClear = vi.fn();
  // showPresets is left off so the chips are not absorbed by an active preset.
  render(
    <ReplayFilterBar
      filters={filters}
      setFilter={setFilter}
      setFilters={setFilters}
      onClear={onClear}
    />,
  );
  return { setFilter, setFilters, onClear };
}

describe("ReplayFilterBar chips", () => {
  it("shows no chips for the neutral default filters", () => {
    renderBar(makeFilters({}));
    expect(screen.queryByLabelText(/Remove .* filter/)).not.toBeInTheDocument();
  });

  it("renders a game chip and clears it on remove", () => {
    const { setFilter } = renderBar(makeFilters({ games: ["nim"] }));
    const chip = screen.getByText(/^Game:/);
    expect(chip).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Remove Game: .* filter/));
    expect(setFilter).toHaveBeenCalledWith("games", []);
  });

  it("renders a result chip and clears it on remove", () => {
    const { setFilter } = renderBar(makeFilters({ results: ["wins"] }));
    expect(screen.getByText(/^Result: Wins/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Remove Result: Wins filter/));
    expect(setFilter).toHaveBeenCalledWith("results", []);
  });

  it("renders an Elo chip and resets the band on remove", () => {
    const { setFilters } = renderBar(makeFilters({ minElo: 1000, maxElo: 1500 }));
    expect(screen.getByText("Elo 1000–1500")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Remove Elo .* filter/));
    expect(setFilters).toHaveBeenCalledWith({
      minElo: defaultReplayFilters.minElo,
      maxElo: defaultReplayFilters.maxElo,
    });
  });

  it("renders a participant-search chip and clears it on remove", () => {
    const { setFilter } = renderBar(makeFilters({ participantSearch: "RookieBot" }));
    expect(screen.getByText(/RookieBot/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Remove .*RookieBot.* filter/));
    expect(setFilter).toHaveBeenCalledWith("participantSearch", "");
  });

  it("renders a rated-only chip and clears it on remove", () => {
    const { setFilter } = renderBar(makeFilters({ ratedOnly: true }));
    expect(screen.getByText("Rated only")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Remove Rated only filter/));
    expect(setFilter).toHaveBeenCalledWith("ratedOnly", false);
  });

  it("counts every active filter (plus a non-baseline sort) in the badge", () => {
    // games + rated-only = 2 chips, and sort 'oldest' differs from the
    // 'newest' baseline used without presets → 3 total.
    renderBar(makeFilters({ games: ["nim"], ratedOnly: true, sort: "oldest" }));
    expect(screen.getByTestId("filter-active-count")).toHaveTextContent("3");
  });

  it("shows participant-type, date, move-count and upsets chips when set (no presets)", () => {
    const { setFilter, setFilters } = renderBar(
      makeFilters({
        participantType: "humans",
        date: "week",
        minMoves: 5,
        maxMoves: 50,
        preset: "upsets",
      }),
    );
    expect(screen.getByText("Humans")).toBeInTheDocument();
    expect(screen.getByText("This week")).toBeInTheDocument();
    expect(screen.getByText("5–50 moves")).toBeInTheDocument();
    expect(screen.getByText("Upsets")).toBeInTheDocument();

    // Removing them routes through the right setters.
    fireEvent.click(screen.getByLabelText(/Remove Humans filter/));
    expect(setFilter).toHaveBeenCalledWith("participantType", "all");
    fireEvent.click(screen.getByLabelText(/Remove This week filter/));
    expect(setFilters).toHaveBeenCalledWith({
      date: "all",
      dateFrom: undefined,
      dateTo: undefined,
    });
    fireEvent.click(screen.getByLabelText(/Remove Upsets filter/));
    expect(setFilter).toHaveBeenCalledWith("preset", undefined);
  });

  it("treats default filters as pristine under presets (shows presets, hides Clear all)", () => {
    const setFilter = vi.fn();
    const setFilters = vi.fn();
    render(
      <ReplayFilterBar
        filters={defaultReplayFilters}
        setFilter={setFilter}
        setFilters={setFilters}
        onClear={vi.fn()}
        showPresets
      />,
    );
    expect(screen.getByTestId("filter-presets")).toBeInTheDocument();
    expect(screen.queryByTestId("filter-clear-all")).not.toBeInTheDocument();
  });
});
