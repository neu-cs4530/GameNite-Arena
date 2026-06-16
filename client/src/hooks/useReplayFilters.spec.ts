import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import React from "react";
import useReplayFilters from "./useReplayFilters.ts";
import { defaultReplayFilters } from "../util/types.ts";

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(MemoryRouter, null, children);
}

// `setFilter`/`setFilters` re-base every write on the LIVE `window.location`,
// not the router's captured params (see the hook's comments). `MemoryRouter`
// never touches `window.location`, so exercising the "strip the param when it
// equals the default" branches needs a real history entry: deep-link the
// param in via `replaceState`, then render under a `BrowserRouter` (which
// reads `window.location`).
function browserWrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(BrowserRouter, null, children);
}

function renderAt(search: string) {
  window.history.replaceState({}, "", search);
  return renderHook(() => useReplayFilters({ pageSize: 24 }), { wrapper: browserWrapper });
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

describe("useReplayFilters — reading malformed and edge URLs", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("falls back to the default when a numeric param is not a number", () => {
    // parseNum's Number.isNaN guard: "abc" parses to NaN, so the filter must
    // resolve to the default rather than NaN.
    const { result } = renderAt("/?minElo=abc");
    expect(result.current.filters.minElo).toBe(defaultReplayFilters.minElo);
  });
});

describe("useReplayFilters — stripping params back to their default", () => {
  // Each case deep-links a non-default param, then writes the default/empty
  // value and asserts the param leaves the URL — covering the "delete" side of
  // every writeFilter branch.
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("strips maxElo when written back to the default", () => {
    const { result } = renderAt("/?maxElo=2000");
    expect(result.current.filters.maxElo).toBe(2000);
    act(() => {
      result.current.setFilter("maxElo", defaultReplayFilters.maxElo);
    });
    expect(window.location.search).not.toContain("maxElo");
    expect(result.current.filters.maxElo).toBe(defaultReplayFilters.maxElo);
  });

  it("strips date when written back to the baseline", () => {
    const { result } = renderAt("/?date=month");
    expect(result.current.filters.date).toBe("month");
    act(() => {
      // Neutral baseline date is "all".
      result.current.setFilter("date", "all");
    });
    expect(window.location.search).not.toContain("date");
    expect(result.current.filters.date).toBe("all");
  });

  it("strips dateFrom when cleared", () => {
    const { result } = renderAt("/?from=2026-01-01");
    expect(result.current.filters.dateFrom).toBe("2026-01-01");
    act(() => {
      result.current.setFilter("dateFrom", undefined);
    });
    expect(window.location.search).not.toContain("from");
    expect(result.current.filters.dateFrom).toBeUndefined();
  });

  it("strips dateTo when cleared", () => {
    const { result } = renderAt("/?to=2026-06-01");
    expect(result.current.filters.dateTo).toBe("2026-06-01");
    act(() => {
      result.current.setFilter("dateTo", undefined);
    });
    expect(window.location.search).not.toContain("to");
    expect(result.current.filters.dateTo).toBeUndefined();
  });

  it("strips minMoves when written back to the default", () => {
    const { result } = renderAt("/?minMoves=10");
    expect(result.current.filters.minMoves).toBe(10);
    act(() => {
      result.current.setFilter("minMoves", defaultReplayFilters.minMoves);
    });
    expect(window.location.search).not.toContain("minMoves");
    expect(result.current.filters.minMoves).toBe(defaultReplayFilters.minMoves);
  });

  it("strips maxMoves when written back to the default", () => {
    const { result } = renderAt("/?maxMoves=80");
    expect(result.current.filters.maxMoves).toBe(80);
    act(() => {
      result.current.setFilter("maxMoves", defaultReplayFilters.maxMoves);
    });
    expect(window.location.search).not.toContain("maxMoves");
    expect(result.current.filters.maxMoves).toBe(defaultReplayFilters.maxMoves);
  });

  it("strips participantSearch when cleared", () => {
    const { result } = renderAt("/?participant=alice");
    expect(result.current.filters.participantSearch).toBe("alice");
    act(() => {
      result.current.setFilter("participantSearch", "");
    });
    expect(window.location.search).not.toContain("participant");
    expect(result.current.filters.participantSearch).toBe("");
  });

  it("strips ratedOnly when set back to false", () => {
    const { result } = renderAt("/?rated=true");
    expect(result.current.filters.ratedOnly).toBe(true);
    act(() => {
      result.current.setFilter("ratedOnly", false);
    });
    expect(window.location.search).not.toContain("rated");
    expect(result.current.filters.ratedOnly).toBe(false);
  });

  it("strips page when set back to 1", () => {
    const { result } = renderAt("/?page=4");
    expect(result.current.filters.page).toBe(4);
    act(() => {
      result.current.setFilter("page", 1);
    });
    expect(window.location.search).not.toContain("page");
    expect(result.current.filters.page).toBe(1);
  });

  it("strips preset when cleared", () => {
    const { result } = renderAt("/?preset=upsets");
    expect(result.current.filters.preset).toBe("upsets");
    act(() => {
      result.current.setFilter("preset", undefined);
    });
    expect(window.location.search).not.toContain("preset");
    expect(result.current.filters.preset).toBeUndefined();
  });

  it("clears the games param when set to an empty list", () => {
    const { result } = renderAt("/?game=nim,connect4");
    expect(result.current.filters.games).toEqual(["nim", "connect4"]);
    act(() => {
      result.current.setFilter("games", []);
    });
    expect(window.location.search).not.toContain("game");
    expect(result.current.filters.games).toEqual([]);
  });

  it("clears the results param when set to an empty list", () => {
    const { result } = renderAt("/?result=wins,losses");
    expect(result.current.filters.results).toEqual(["wins", "losses"]);
    act(() => {
      result.current.setFilter("results", []);
    });
    expect(window.location.search).not.toContain("result");
    expect(result.current.filters.results).toEqual([]);
  });

  it("treats a nullish games value as an empty list", () => {
    // The `(value as ReplayGameKey[]) ?? []` fallback: an undefined games value
    // must clear the param rather than throw.
    const { result } = renderAt("/?game=nim");
    act(() => {
      result.current.setFilter("games", undefined as never);
    });
    expect(window.location.search).not.toContain("game");
    expect(result.current.filters.games).toEqual([]);
  });

  it("treats a nullish results value as an empty list", () => {
    const { result } = renderAt("/?result=wins");
    act(() => {
      result.current.setFilter("results", undefined as never);
    });
    expect(window.location.search).not.toContain("result");
    expect(result.current.filters.results).toEqual([]);
  });
});

describe("useReplayFilters — setFilters branches", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("clears a key passed explicitly as undefined", () => {
    // setFilters' `value === undefined` branch routes through writeFilter with
    // an undefined value, stripping the param.
    window.history.replaceState({}, "", "/?participant=bob");
    const { result } = renderHook(() => useReplayFilters({ pageSize: 24 }), {
      wrapper: browserWrapper,
    });
    expect(result.current.filters.participantSearch).toBe("bob");
    act(() => {
      result.current.setFilters({ participantSearch: undefined });
    });
    expect(window.location.search).not.toContain("participant");
    expect(result.current.filters.participantSearch).toBe("");
  });

  it("keeps the page param when only page changes", () => {
    // The `onlyPage` guard skips the pagination reset, so page survives.
    const { result } = renderHook(() => useReplayFilters({ pageSize: 24 }), {
      wrapper: browserWrapper,
    });
    act(() => {
      result.current.setFilters({ page: 3 });
    });
    expect(result.current.filters.page).toBe(3);
  });
});

describe("useReplayFilters — unhandled keys", () => {
  it("ignores keys not reflected in the URL (writeFilter default case)", () => {
    // `pageSize` is an internal field with no URL representation, so writing it
    // hits writeFilter's default branch and leaves the query string untouched.
    const { result } = renderHook(() => useReplayFilters({ pageSize: 24 }), { wrapper });
    act(() => {
      result.current.setFilter("pageSize", 50);
    });
    // pageSize comes from the option, not the URL, so it stays at 24.
    expect(result.current.filters.pageSize).toBe(24);
  });
});
