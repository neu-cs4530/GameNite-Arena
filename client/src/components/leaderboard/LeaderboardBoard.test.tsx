import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import LeaderboardBoard from "./LeaderboardBoard.tsx";
import type { LeaderboardPage } from "../../util/types.ts";
import type { LeaderboardEntry } from "../../util/types.ts";

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
  getLeaderboard: (...args: unknown[]) => mockedGetLeaderboard(...args),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntry(rank: number, username: string, entityType: "human" | "ai" = "human"): LeaderboardEntry {
  return {
    rank,
    entityId: `id-${username}`,
    entityType,
    displayName: username,
    username,
    rating: 1500 + rank * 10,
    rd: 80,
    vol: 0.06,
    gamesPlayed: 10,
    wins: 5,
    winRate: 0.5,
  };
}

function makePage(entries: LeaderboardEntry[]): LeaderboardPage {
  return { entries, total: entries.length, page: 1, pageSize: 100 };
}

function renderBoard(props: { compact?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <LeaderboardBoard gameKey="nim" {...props} />
    </MemoryRouter>,
  );
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
    mockedGetLeaderboard.mockResolvedValue(
      makePage([makeEntry(1, "alice"), makeEntry(2, "bob")]),
    );
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
