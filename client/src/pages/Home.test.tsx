import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { SafeUserInfo } from "@gamenite/shared";
import { LoginContext } from "../contexts/LoginContext.ts";
import type { GameSocket } from "../util/types.ts";
import type { DailyPuzzle } from "../services/puzzleMapper.ts";
import { fetchDailyPuzzle } from "../services/puzzleService.ts";
import Home from "./Home.tsx";

vi.mock("../services/puzzleService.ts", () => ({
  fetchDailyPuzzle: vi.fn(),
  submitPuzzleAttempt: vi.fn(),
  requestPuzzleHint: vi.fn(),
}));

// Home's other strips fetch on mount; keep them quiet and empty so the
// puzzle card is the only network-shaped thing under test.
vi.mock("../services/gameService.ts", () => ({
  gameList: vi.fn().mockResolvedValue([]),
}));
vi.mock("../services/threadService.ts", () => ({
  threadList: vi.fn().mockResolvedValue([]),
}));

const mockedFetch = vi.mocked(fetchDailyPuzzle);

const viewer: SafeUserInfo = { username: "ada", display: "Ada", createdAt: new Date(0) };

const nimPuzzle: DailyPuzzle = {
  gameKey: "nim",
  date: "2026-06-11",
  position: { kind: "nim", view: { remaining: 6, nextPlayer: 0 } },
  viewerAttempt: { attempted: false, solved: false, rated: false },
};

function renderHome(): void {
  render(
    <LoginContext.Provider
      value={{ user: viewer, pass: "pw", reset: () => {}, socket: {} as GameSocket }}
    >
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    </LoginContext.Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Home: daily puzzle card", () => {
  it("shows today's puzzle game with a CTA to /puzzles", async () => {
    mockedFetch.mockResolvedValue(nimPuzzle);
    renderHome();

    const card = await screen.findByTestId("home-puzzle-card");
    expect(card).toHaveTextContent("Nim");
    expect(screen.getByTestId("home-puzzle-cta")).toHaveAttribute("href", "/puzzles");
    expect(mockedFetch).toHaveBeenCalledWith("nim", "ada");
  });

  it("shows the real solved-today state from viewerAttempt", async () => {
    mockedFetch.mockResolvedValue({
      ...nimPuzzle,
      viewerAttempt: { attempted: true, solved: true, rated: true },
    });
    renderHome();

    expect(await screen.findByTestId("home-puzzle-solved-nim")).toHaveTextContent(/solved today/i);
  });

  it("hides the card entirely on a puzzle outage — Home never breaks", async () => {
    mockedFetch.mockRejectedValue(new Error("puzzle service down"));
    renderHome();

    await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId("home-puzzle-card")).not.toBeInTheDocument());
    // the rest of Home still renders
    expect(screen.getByText("Recent games")).toBeInTheDocument();
  });

  it("hides the card when no game has a puzzle today (honest absence, not a husk)", async () => {
    mockedFetch.mockResolvedValue(null);
    renderHome();

    await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId("home-puzzle-card")).not.toBeInTheDocument());
  });
});
