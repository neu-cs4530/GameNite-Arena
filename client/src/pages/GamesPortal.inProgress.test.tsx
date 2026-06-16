import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { GameInfo, SafeUserInfo } from "@gamenite/shared";
import { LoginContext } from "../contexts/LoginContext.ts";
import type { GameSocket } from "../util/types.ts";
import GamesPortal from "./GamesPortal.tsx";

// Spy on navigation so the tile-click branch can be asserted.
const navigateSpy = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>();
  return { ...mod, useNavigate: () => navigateSpy };
});

// Hoisted so the (hoisted) vi.mock factories below can see it.
const activeGame = vi.hoisted(
  () =>
    ({
      gameId: "g1",
      type: "nim",
      status: "active",
      createdAt: "2026-06-01T00:00:00Z",
      players: [{ username: "ada" }],
    }) as unknown as GameInfo,
);

vi.mock("../services/gameService.ts", () => ({
  gameList: vi.fn().mockResolvedValue([activeGame]),
}));
vi.mock("../services/matchmakingService.ts", () => ({
  // Return the active game so the in-progress list (not the empty state) renders.
  inProgressGamesFor: vi.fn().mockReturnValue([activeGame]),
  queueTileLabel: vi.fn().mockReturnValue("Quiet right now"),
}));
vi.mock("../hooks/useQueueCounts.ts", () => ({ default: () => ({}) }));
vi.mock("../hooks/useDailyPuzzles.ts", () => ({ default: () => ({ data: {} }) }));

const viewer: SafeUserInfo = { username: "ada", display: "Ada", createdAt: new Date(0) };

function renderPortal() {
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
  navigateSpy.mockClear();
});

describe("GamesPortal in-progress list", () => {
  it("lists the user's unfinished games with a status badge", async () => {
    renderPortal();
    // Open the (collapsed) in-progress disclosure.
    fireEvent.click(screen.getByTestId("games-in-progress-toggle"));

    await waitFor(() => expect(screen.getByTestId("in-progress-list")).toBeInTheDocument());
    const list = screen.getByTestId("in-progress-list");
    expect(list).toHaveTextContent(/A game of Nim/i);
    expect(list).toHaveTextContent("active");
  });

  it("navigates to the game's section page when a tile is selected", () => {
    renderPortal();
    fireEvent.click(screen.getByTestId("game-tile-nim"));
    expect(navigateSpy).toHaveBeenCalledWith("/games/nim");
  });
});
