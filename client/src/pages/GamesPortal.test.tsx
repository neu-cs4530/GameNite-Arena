import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { SafeUserInfo } from "@gamenite/shared";
import { LoginContext } from "../contexts/LoginContext.ts";
import type { GameSocket } from "../util/types.ts";
import type { DailyPuzzle } from "../services/puzzleMapper.ts";
import { fetchDailyPuzzle } from "../services/puzzleService.ts";
import GamesPortal from "./GamesPortal.tsx";

vi.mock("../services/puzzleService.ts", () => ({
  fetchDailyPuzzle: vi.fn(),
  submitPuzzleAttempt: vi.fn(),
  requestPuzzleHint: vi.fn(),
}));

// the portal's matchmaking machinery is not under test — keep it inert
vi.mock("../services/matchmakingService.ts", () => ({
  fetchQueueCounts: vi.fn().mockResolvedValue({}),
  fetchRating: vi.fn().mockResolvedValue(null),
  inProgressGamesFor: vi.fn().mockReturnValue([]),
  queueTileLabel: vi.fn().mockReturnValue("Quiet right now"),
}));
vi.mock("../services/gameService.ts", () => ({
  gameList: vi.fn().mockResolvedValue([]),
}));

const mockedFetch = vi.mocked(fetchDailyPuzzle);

const viewer: SafeUserInfo = { username: "ada", display: "Ada", createdAt: new Date(0) };

const nimPuzzle: DailyPuzzle = {
  gameKey: "nim",
  date: "2026-06-11",
  position: { kind: "nim", view: { remaining: 6, nextPlayer: 0 } },
  viewerAttempt: { attempted: false, solved: false, rated: false },
};

function renderPortal(): void {
  render(
    <LoginContext.Provider
      value={{ user: viewer, pass: "pw", reset: () => {}, socket: {} as GameSocket }}
    >
      <MemoryRouter>
        <GamesPortal />
      </MemoryRouter>
    </LoginContext.Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GamesPortal: daily-puzzle tile badge", () => {
  it("badges puzzle-enabled games only", async () => {
    mockedFetch.mockResolvedValue(nimPuzzle);
    renderPortal();

    // every puzzle-enabled game gets a badge now, so scope to the nim tile
    const badge = await within(screen.getByTestId("game-tile-nim")).findByTestId(
      "portal-puzzle-badge",
    );
    expect(badge).toHaveTextContent(/daily puzzle/i);
    // guess is not puzzle-enabled — its tile carries no badge
    expect(
      within(screen.getByTestId("game-tile-guess")).queryByTestId("portal-puzzle-badge"),
    ).not.toBeInTheDocument();
  });

  it("shows the solved state from viewerAttempt", async () => {
    mockedFetch.mockResolvedValue({
      ...nimPuzzle,
      viewerAttempt: { attempted: true, solved: true, rated: true },
    });
    renderPortal();

    const badge = await within(screen.getByTestId("game-tile-nim")).findByTestId(
      "portal-puzzle-badge",
    );
    expect(badge).toHaveTextContent(/solved/i);
  });

  it("falls back to the plain badge when the puzzle fetch fails", async () => {
    mockedFetch.mockRejectedValue(new Error("down"));
    renderPortal();

    await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
    const badge = await within(screen.getByTestId("game-tile-nim")).findByTestId(
      "portal-puzzle-badge",
    );
    expect(badge).toHaveTextContent(/daily puzzle/i);
    expect(badge).not.toHaveTextContent(/solved/i);
  });
});
