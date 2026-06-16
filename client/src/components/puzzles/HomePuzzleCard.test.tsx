import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { SafeUserInfo } from "@gamenite/shared";
import { LoginContext } from "../../contexts/LoginContext.ts";
import type { GameSocket } from "../../util/types.ts";
import type { DailyPuzzle } from "../../services/puzzleMapper.ts";
import { fetchDailyPuzzle } from "../../services/puzzleService.ts";
import HomePuzzleCard from "./HomePuzzleCard.tsx";

vi.mock("../../services/puzzleService.ts", () => ({
  fetchDailyPuzzle: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchDailyPuzzle);

const viewer: SafeUserInfo = { username: "ada", display: "Ada", createdAt: new Date(0) };

const nimPuzzle: DailyPuzzle = {
  gameKey: "nim",
  date: "2026-06-15",
  position: { kind: "nim", view: { remaining: 6, nextPlayer: 0 } },
  viewerAttempt: null,
};

function renderCard(): void {
  render(
    <MemoryRouter>
      <LoginContext.Provider
        value={{ user: viewer, pass: "pw", reset: () => {}, socket: {} as GameSocket }}
      >
        <HomePuzzleCard />
      </LoginContext.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("HomePuzzleCard: renders nothing while loading", () => {
  it("returns null when puzzle data is still pending", () => {
    mockedFetch.mockReturnValue(new Promise(() => {}));
    renderCard();
    expect(screen.queryByTestId("home-puzzle-card")).not.toBeInTheDocument();
  });
});

describe("HomePuzzleCard: renders nothing when no puzzles available", () => {
  it("returns null when all game slots errored", async () => {
    mockedFetch.mockRejectedValue(new Error("down"));
    renderCard();
    await vi.waitFor(() => {
      expect(screen.queryByTestId("home-puzzle-card")).not.toBeInTheDocument();
    });
  });

  it("returns null when all games have no puzzle today (404)", async () => {
    mockedFetch.mockResolvedValue(null);
    renderCard();
    await vi.waitFor(() => {
      expect(screen.queryByTestId("home-puzzle-card")).not.toBeInTheDocument();
    });
  });
});

describe("HomePuzzleCard: renders with available puzzles", () => {
  it("shows an Unsolved badge when the viewer has not solved the puzzle", async () => {
    mockedFetch.mockImplementation((key) =>
      key === "nim" ? Promise.resolve(nimPuzzle) : Promise.reject(new Error("none")),
    );
    renderCard();

    expect(await screen.findByTestId("home-puzzle-card")).toBeInTheDocument();
    expect(screen.getByTestId("home-puzzle-game-nim")).toBeInTheDocument();
    expect(screen.getByText("Unsolved")).toBeInTheDocument();
    expect(screen.queryByTestId("home-puzzle-solved-nim")).not.toBeInTheDocument();
  });

  it("shows a Solved badge when the viewer has already solved the puzzle", async () => {
    mockedFetch.mockImplementation((key) =>
      key === "nim"
        ? Promise.resolve({
            ...nimPuzzle,
            viewerAttempt: { attempted: true, solved: true, rated: true },
          })
        : Promise.reject(new Error("none")),
    );
    renderCard();

    expect(await screen.findByTestId("home-puzzle-solved-nim")).toBeInTheDocument();
    expect(screen.getByTestId("home-puzzle-solved-nim")).toHaveTextContent(/solved today/i);
  });

  it("links to /puzzles", async () => {
    mockedFetch.mockImplementation((key) =>
      key === "nim" ? Promise.resolve(nimPuzzle) : Promise.reject(new Error("none")),
    );
    renderCard();

    const cta = await screen.findByTestId("home-puzzle-cta");
    expect(cta).toHaveAttribute("href", "/puzzles");
  });
});
