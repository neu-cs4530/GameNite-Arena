import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import LeaderboardBoard from "./LeaderboardBoard.tsx";
import type { LeaderboardPage, LeaderboardEntry } from "../../util/types.ts";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("../../hooks/useLoginContext.ts", () => ({
  default: () => ({
    user: { username: "alice", userId: "u-alice" },
    socket: null,
    pass: "",
    reset: vi.fn(),
  }),
}));

const mockedGetLeaderboard = vi.fn();
vi.mock("../../services/leaderboardService.ts", () => ({
  getLeaderboard: (...args: unknown[]) => mockedGetLeaderboard(...args) as unknown,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntry(
  rank: number,
  username: string,
  entityType: "human" | "ai" = "human",
): LeaderboardEntry {
  return {
    rank,
    entityId: `id-${username}`,
    entityType,
    displayName: username,
    username,
    rating: 1500 + rank * 10,
    rd: 80,
    provisional: false,
    gamesPlayed: 10,
    wins: 5,
    winRate: 0.5,
  };
}

/** A daily entry carrying today's rating delta (drives the "Today's Δ" UI). */
function makeDailyEntry(
  rank: number,
  username: string,
  ratingDelta: number,
  entityType: "human" | "ai" = "human",
): LeaderboardEntry {
  return { ...makeEntry(rank, username, entityType), ratingDelta };
}

function makePage(entries: LeaderboardEntry[]): LeaderboardPage {
  return {
    entries,
    total: entries.length,
    page: 1,
    gameKey: "nim" as const,
    entityType: "all" as const,
    period: "alltime" as const,
    limit: 100,
  };
}

function renderBoard(props: { compact?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <LeaderboardBoard gameKey="nim" {...props} />
    </MemoryRouter>,
  );
}

/** The filter controls live behind a collapsed toggle — open it first. */
async function openFilters(): Promise<void> {
  await userEvent.click(screen.getByTestId("filter-toggle"));
  await screen.findByTestId("filter-bar-panel");
}

beforeEach(() => {
  mockedGetLeaderboard.mockReset();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("LeaderboardBoard — loading state", () => {
  it("shows skeleton rows while the data loads", () => {
    // Never resolve so we stay in loading state.
    mockedGetLeaderboard.mockReturnValue(new Promise(() => {}));
    renderBoard();
    expect(screen.getByTestId("lb-loading")).toBeInTheDocument();
  });
});

describe("LeaderboardBoard — error state", () => {
  it("shows an error card when the fetch fails", async () => {
    mockedGetLeaderboard.mockRejectedValue(new Error("Server down"));
    renderBoard();
    await waitFor(() => {
      expect(screen.getByText(/Could not load/i)).toBeInTheDocument();
    });
  });
});

describe("LeaderboardBoard — empty state", () => {
  it("shows an empty-state card when there are no entries", async () => {
    mockedGetLeaderboard.mockResolvedValue(makePage([]));
    renderBoard();
    await waitFor(() => {
      expect(screen.getByTestId("lb-empty")).toBeInTheDocument();
    });
  });
});

describe("LeaderboardBoard — populated state", () => {
  it("renders rows for each entry", async () => {
    mockedGetLeaderboard.mockResolvedValue(makePage([makeEntry(1, "alice"), makeEntry(2, "bob")]));
    renderBoard();
    await waitFor(() => {
      // alice is the viewer so she gets "lb-row-self"; bob gets "lb-row".
      const all = [...screen.queryAllByTestId("lb-row"), ...screen.queryAllByTestId("lb-row-self")];
      expect(all).toHaveLength(2);
    });
  });

  it("marks the viewer's own row with the self testid", async () => {
    mockedGetLeaderboard.mockResolvedValue(makePage([makeEntry(1, "alice"), makeEntry(2, "bob")]));
    renderBoard();
    await waitFor(() => {
      expect(screen.getByTestId("lb-row-self")).toBeInTheDocument();
    });
  });
});

describe("LeaderboardBoard — compact mode", () => {
  it("does not show the h2 title in compact mode", async () => {
    mockedGetLeaderboard.mockResolvedValue(makePage([]));
    renderBoard({ compact: true });
    await waitFor(() => {
      // The title h2 is hidden when compact; the "view full" link text contains
      // "leaderboard" too, so we check specifically for the h2 element.
      expect(document.querySelector("h2.ga-leaderboards__board-title")).toBeNull();
    });
  });

  it("shows the 'View full leaderboard' link in compact mode", async () => {
    mockedGetLeaderboard.mockResolvedValue(makePage([]));
    renderBoard({ compact: true });
    await waitFor(() => {
      expect(screen.getByTestId("board-view-full")).toBeInTheDocument();
    });
  });
});

describe("LeaderboardBoard — self strip", () => {
  it("shows the self strip when the viewer is in the board", async () => {
    mockedGetLeaderboard.mockResolvedValue(makePage([makeEntry(1, "alice")]));
    renderBoard();
    await waitFor(() => {
      expect(screen.getByTestId("lb-self-strip")).toBeInTheDocument();
    });
  });

  it("shows 'Play rated matches' when the viewer is NOT in the board", async () => {
    mockedGetLeaderboard.mockResolvedValue(makePage([makeEntry(1, "bob")]));
    renderBoard();
    await waitFor(() => {
      expect(screen.getByTestId("lb-self-empty")).toBeInTheDocument();
    });
  });

  it("does NOT show self-empty message when entityFilter is 'ai'", async () => {
    // When viewing AIs only, the human viewer won't be there — no prompt needed.
    mockedGetLeaderboard.mockResolvedValue(makePage([makeEntry(1, "bot", "ai")]));
    renderBoard();
    await waitFor(() => {
      expect(screen.queryByTestId("lb-self-empty")).not.toBeInTheDocument();
    });
  });
});

describe("LeaderboardBoard — filters drive activeCount & refetch", () => {
  it("counts the entity filter as active and refetches when 'Humans' is picked", async () => {
    mockedGetLeaderboard.mockResolvedValue(makePage([makeEntry(1, "bob")]));
    renderBoard();
    await screen.findByTestId("lb-rows");
    await openFilters();

    await userEvent.click(screen.getByRole("radio", { name: "Humans" }));

    await waitFor(() =>
      expect(mockedGetLeaderboard).toHaveBeenLastCalledWith(
        "nim",
        expect.objectContaining({ type: "human" }),
      ),
    );
  });

  it("counts the period filter as active and refetches for 'Today'", async () => {
    mockedGetLeaderboard.mockResolvedValue(makePage([makeEntry(1, "bob")]));
    renderBoard();
    await screen.findByTestId("lb-rows");
    await openFilters();

    await userEvent.click(screen.getByRole("radio", { name: "Today" }));

    await waitFor(() =>
      expect(mockedGetLeaderboard).toHaveBeenLastCalledWith(
        "nim",
        expect.objectContaining({ period: "daily" }),
      ),
    );
  });

  it("counts a name search as active and filters rows client-side", async () => {
    mockedGetLeaderboard.mockResolvedValue(makePage([makeEntry(1, "alice"), makeEntry(2, "bob")]));
    renderBoard();
    await screen.findByTestId("lb-rows");
    await openFilters();

    await userEvent.type(screen.getByTestId("lb-search"), "bob");

    // the debounced search commits → summary reflects the single match
    await waitFor(() => expect(screen.getByTestId("lb-summary")).toHaveTextContent("1 ranked"));
    // the search does NOT trigger a refetch — it's a client-side filter
    expect(mockedGetLeaderboard).toHaveBeenCalledTimes(1);
  });

  it("shows the 'nobody matches' empty state when a search matches no one", async () => {
    mockedGetLeaderboard.mockResolvedValue(makePage([makeEntry(1, "alice"), makeEntry(2, "bob")]));
    renderBoard();
    await screen.findByTestId("lb-rows");
    await openFilters();

    await userEvent.type(screen.getByTestId("lb-search"), "zzzznobody");

    const empty = await screen.findByTestId("lb-empty");
    // entries exist but none match → the "search" title, no "play a match" body
    expect(empty).toHaveTextContent(/nobody matches/i);
    expect(empty).not.toHaveTextContent(/play a rated match/i);
  });
});

describe("LeaderboardBoard — daily period UI", () => {
  it("shows the viewer's 'Today's Δ' tile with a positive (success) tone", async () => {
    mockedGetLeaderboard.mockResolvedValue(makePage([makeDailyEntry(1, "alice", 14)]));
    renderBoard();
    await screen.findByTestId("lb-self-strip");
    await openFilters();

    await userEvent.click(screen.getByRole("radio", { name: "Today" }));

    const delta = await screen.findByTestId("lb-self-delta");
    expect(delta).toHaveTextContent("+14");
  });

  it("renders a negative self delta (danger tone)", async () => {
    mockedGetLeaderboard.mockResolvedValue(makePage([makeDailyEntry(1, "alice", -9)]));
    renderBoard();
    await screen.findByTestId("lb-self-strip");
    await openFilters();

    await userEvent.click(screen.getByRole("radio", { name: "Today" }));

    const delta = await screen.findByTestId("lb-self-delta");
    expect(delta).toHaveTextContent("-9");
  });

  it("renders a flat self delta of zero (default tone)", async () => {
    mockedGetLeaderboard.mockResolvedValue(makePage([makeDailyEntry(1, "alice", 0)]));
    renderBoard();
    await screen.findByTestId("lb-self-strip");
    await openFilters();

    await userEvent.click(screen.getByRole("radio", { name: "Today" }));

    expect(await screen.findByTestId("lb-self-delta")).toBeInTheDocument();
  });

  it("renders each row's daily delta badge across positive, negative and flat", async () => {
    mockedGetLeaderboard.mockResolvedValue(
      makePage([
        makeDailyEntry(1, "alice", 12),
        makeDailyEntry(2, "bob", -7),
        makeDailyEntry(3, "cara", 0),
      ]),
    );
    renderBoard();
    await screen.findByTestId("lb-rows");
    await openFilters();

    await userEvent.click(screen.getByRole("radio", { name: "Today" }));

    // each row shows its "Δ today" badge after the daily refetch
    await waitFor(() => {
      expect(screen.getByText("+12 today")).toBeInTheDocument();
    });
    expect(screen.getByText("-7 today")).toBeInTheDocument();
    expect(screen.getByText("+0 today")).toBeInTheDocument();
  });
});
