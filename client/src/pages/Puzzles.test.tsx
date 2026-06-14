import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { SafeUserInfo } from "@gamenite/shared";
import { LoginContext } from "../contexts/LoginContext.ts";
import type { GameSocket } from "../util/types.ts";
import type { DailyPuzzle } from "../services/puzzleMapper.ts";
import { fetchDailyPuzzle } from "../services/puzzleService.ts";
import Puzzles from "./Puzzles.tsx";

vi.mock("../services/puzzleService.ts", () => ({
  fetchDailyPuzzle: vi.fn(),
  submitPuzzleAttempt: vi.fn(),
  requestPuzzleHint: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchDailyPuzzle);

const viewer: SafeUserInfo = { username: "ada", display: "Ada", createdAt: new Date(0) };

const nimPuzzle: DailyPuzzle = {
  gameKey: "nim",
  date: "2026-06-11",
  position: { kind: "nim", view: { remaining: 6, nextPlayer: 0 } },
  viewerAttempt: null,
};

function renderPage(initialEntry = "/puzzles"): void {
  render(
    <LoginContext.Provider
      value={{ user: viewer, pass: "pw", reset: () => {}, socket: {} as GameSocket }}
    >
      <MemoryRouter initialEntries={[initialEntry]}>
        <Puzzles />
      </MemoryRouter>
    </LoginContext.Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Puzzles page: real solved-today badges", () => {
  it("fetches with ?for=<viewer> so the badge survives a refresh", async () => {
    mockedFetch.mockResolvedValue({
      ...nimPuzzle,
      viewerAttempt: { attempted: true, solved: true, rated: true },
    });
    renderPage();

    // the badge comes from viewerAttempt on the GET — no attempt this session
    expect(await screen.findByTestId("puzzle-solved-nim")).toHaveTextContent(/solved today/i);
    expect(mockedFetch).toHaveBeenCalledWith("nim", "ada");
  });

  it("shows the plain daily-puzzle note when the viewer hasn't solved today", async () => {
    mockedFetch.mockResolvedValue(nimPuzzle);
    renderPage();

    expect(await screen.findByTestId("puzzle-game-tile-nim")).toHaveTextContent(/daily puzzle/i);
    expect(screen.queryByTestId("puzzle-solved-nim")).not.toBeInTheDocument();
  });
});

describe("Puzzles page: selected game card", () => {
  it("renders the daily puzzle card for a deep-linked game", async () => {
    mockedFetch.mockResolvedValue(nimPuzzle);
    renderPage("/puzzles?game=nim");

    expect(await screen.findByTestId("puzzle-card")).toBeInTheDocument();
    expect(screen.getByTestId("puzzle-board-nim")).toBeInTheDocument();
  });

  it("renders a retryable error state when the fetch fails (no mock fallback)", async () => {
    mockedFetch.mockRejectedValue(new Error("boom"));
    renderPage("/puzzles?game=nim");

    expect(await screen.findByTestId("puzzle-error")).toBeInTheDocument();
    expect(screen.queryByTestId("puzzle-card")).not.toBeInTheDocument();
  });

  it("renders the honest empty state when there is no puzzle today (404 → null)", async () => {
    mockedFetch.mockResolvedValue(null);
    renderPage("/puzzles?game=nim");

    expect(await screen.findByTestId("puzzle-empty")).toBeInTheDocument();
  });
});
