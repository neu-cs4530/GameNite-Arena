import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import useReplayFilters from "./useReplayFilters.ts";
import { defaultReplayFilters } from "../util/types.ts";

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(MemoryRouter, null, children);
}

describe("useReplayFilters — initial defaults", () => {
  it("returns the neutral baseline when the URL is empty", () => {
    const { result } = renderHook(() => useReplayFilters({ pageSize: 24 }), { wrapper });
    const { filters } = result.current;
    expect(filters.sort).toBe("newest");
    expect(filters.participantType).toBe("all");
    expect(filters.games).toEqual([]);
    expect(filters.results).toEqual([]);
    expect(filters.date).toBe("all");
    expect(filters.page).toBe(1);
    expect(filters.pageSize).toBe(24);
  });

  it("respects caller-supplied defaults for sort and date", () => {
    const { result } = renderHook(
      () => useReplayFilters({ pageSize: 24, defaults: { sort: "most-viewed", date: "week" } }),
      { wrapper },
    );
    expect(result.current.filters.sort).toBe("most-viewed");
    expect(result.current.filters.date).toBe("week");
  });
});

describe("useReplayFilters — setFilter", () => {
  it("updates sort", () => {
    const { result } = renderHook(() => useReplayFilters({ pageSize: 24 }), { wrapper });
    act(() => {
      result.current.setFilter("sort", "oldest");
    });
    expect(result.current.filters.sort).toBe("oldest");
  });

  it("updates games list", () => {
    const { result } = renderHook(() => useReplayFilters({ pageSize: 24 }), { wrapper });
    act(() => {
      result.current.setFilter("games", ["nim", "connect4"]);
    });
    expect(result.current.filters.games).toEqual(["nim", "connect4"]);
  });

  it("updates participantType", () => {
    const { result } = renderHook(() => useReplayFilters({ pageSize: 24 }), { wrapper });
    act(() => {
      result.current.setFilter("participantType", "humans");
    });
    expect(result.current.filters.participantType).toBe("humans");
  });

  it("updates results filter", () => {
    const { result } = renderHook(() => useReplayFilters({ pageSize: 24 }), { wrapper });
    act(() => {
      result.current.setFilter("results", ["wins", "losses"]);
    });
    expect(result.current.filters.results).toContain("wins");
    expect(result.current.filters.results).toContain("losses");
  });

  it("updates minElo / maxElo", () => {
    const { result } = renderHook(() => useReplayFilters({ pageSize: 24 }), { wrapper });
    // Use setFilters to batch both writes so each read of window.location.search
    // sees the full accumulated params (MemoryRouter doesn't update window.location).
    act(() => {
      result.current.setFilters({ minElo: 1200, maxElo: 1800 });
    });
    expect(result.current.filters.minElo).toBe(1200);
    expect(result.current.filters.maxElo).toBe(1800);
  });

  it("updates date, dateFrom, and dateTo", () => {
    const { result } = renderHook(() => useReplayFilters({ pageSize: 24 }), { wrapper });
    act(() => {
      result.current.setFilters({ date: "month", dateFrom: "2026-01-01", dateTo: "2026-06-01" });
    });
    expect(result.current.filters.date).toBe("month");
    expect(result.current.filters.dateFrom).toBe("2026-01-01");
    expect(result.current.filters.dateTo).toBe("2026-06-01");
  });

  it("updates minMoves / maxMoves", () => {
    const { result } = renderHook(() => useReplayFilters({ pageSize: 24 }), { wrapper });
    act(() => {
      result.current.setFilters({ minMoves: 5, maxMoves: 50 });
    });
    expect(result.current.filters.minMoves).toBe(5);
    expect(result.current.filters.maxMoves).toBe(50);
  });

  it("updates participantSearch", () => {
    const { result } = renderHook(() => useReplayFilters({ pageSize: 24 }), { wrapper });
    act(() => {
      result.current.setFilter("participantSearch", "alice");
    });
    expect(result.current.filters.participantSearch).toBe("alice");
  });

  it("updates ratedOnly", () => {
    const { result } = renderHook(() => useReplayFilters({ pageSize: 24 }), { wrapper });
    act(() => {
      result.current.setFilter("ratedOnly", true);
    });
    expect(result.current.filters.ratedOnly).toBe(true);
  });

  it("updates page", () => {
    const { result } = renderHook(() => useReplayFilters({ pageSize: 24 }), { wrapper });
    act(() => {
      result.current.setFilter("page", 3);
    });
    expect(result.current.filters.page).toBe(3);
  });

  it("updates preset", () => {
    const { result } = renderHook(() => useReplayFilters({ pageSize: 24 }), { wrapper });
    act(() => {
      result.current.setFilter("preset", "upsets");
    });
    expect(result.current.filters.preset).toBe("upsets");
  });

  it("clears sort back to default when set to the baseline sort value", () => {
    const { result } = renderHook(() => useReplayFilters({ pageSize: 24 }), { wrapper });
    act(() => {
      result.current.setFilter("sort", "oldest");
    });
    // Set back to the default "newest" — it should be stripped from the URL.
    act(() => {
      result.current.setFilter("sort", "newest");
    });
    expect(result.current.filters.sort).toBe("newest");
  });

  it("clears minElo when set back to default", () => {
    const { result } = renderHook(() => useReplayFilters({ pageSize: 24 }), { wrapper });
    act(() => {
      result.current.setFilter("minElo", 1000);
    });
    act(() => {
      result.current.setFilter("minElo", defaultReplayFilters.minElo);
    });
    expect(result.current.filters.minElo).toBe(defaultReplayFilters.minElo);
  });

  it("clears participantType when set back to 'all'", () => {
    const { result } = renderHook(() => useReplayFilters({ pageSize: 24 }), { wrapper });
    act(() => {
      result.current.setFilter("participantType", "humans");
    });
    act(() => {
      result.current.setFilter("participantType", "all");
    });
    expect(result.current.filters.participantType).toBe("all");
  });

  it("clears games when set to empty array", () => {
    const { result } = renderHook(() => useReplayFilters({ pageSize: 24 }), { wrapper });
    act(() => {
      result.current.setFilter("games", ["nim"]);
    });
    act(() => {
      result.current.setFilter("games", []);
    });
    expect(result.current.filters.games).toEqual([]);
  });

  it("clears results when set to empty array", () => {
    const { result } = renderHook(() => useReplayFilters({ pageSize: 24 }), { wrapper });
    act(() => {
      result.current.setFilter("results", ["wins"]);
    });
    act(() => {
      result.current.setFilter("results", []);
    });
    expect(result.current.filters.results).toEqual([]);
  });
});

describe("useReplayFilters — setFilters (batch update)", () => {
  it("applies multiple keys in one call", () => {
    const { result } = renderHook(() => useReplayFilters({ pageSize: 24 }), { wrapper });
    act(() => {
      result.current.setFilters({ sort: "oldest", ratedOnly: true, participantType: "ais" });
    });
    expect(result.current.filters.sort).toBe("oldest");
    expect(result.current.filters.ratedOnly).toBe(true);
    expect(result.current.filters.participantType).toBe("ais");
  });

  it("resets pagination unless only page is changed", () => {
    const { result } = renderHook(() => useReplayFilters({ pageSize: 24 }), { wrapper });
    act(() => {
      result.current.setFilter("page", 5);
    });
    expect(result.current.filters.page).toBe(5);
    // Changing another filter also resets page.
    act(() => {
      result.current.setFilters({ sort: "oldest" });
    });
    expect(result.current.filters.page).toBe(1);
  });
});

describe("useReplayFilters — clearFilters", () => {
  it("resets all filters to defaults", () => {
    const { result } = renderHook(() => useReplayFilters({ pageSize: 24 }), { wrapper });
    act(() => {
      result.current.setFilter("sort", "oldest");
    });
    act(() => {
      result.current.clearFilters();
    });
    expect(result.current.filters.sort).toBe("newest");
    expect(result.current.filters.participantType).toBe("all");
  });
});
