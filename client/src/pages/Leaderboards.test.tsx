import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { PuzzleLeaderboardPage, SafeUserInfo } from "@gamenite/shared";
import { LoginContext } from "../contexts/LoginContext.ts";
import type { GameSocket } from "../util/types.ts";
import { getLeaderboard, getPuzzleLeaderboard } from "../services/leaderboardService.ts";
import Leaderboards from "./Leaderboards.tsx";

vi.mock("../services/leaderboardService.ts", () => ({
  getLeaderboard: vi.fn(),
  getPuzzleLeaderboard: vi.fn(),
}));

const mockedPuzzleBoard = vi.mocked(getPuzzleLeaderboard);
const mockedMatchBoard = vi.mocked(getLeaderboard);

const viewer: SafeUserInfo = { username: "ada", display: "Ada", createdAt: new Date(0) };

// small inline wire literal — the puzzle leaderboard page exactly as served
const overallPage: PuzzleLeaderboardPage = {
  scope: "overall",
  page: 1,
  pageSize: 50,
  total: 2,
  entries: [
    {
      rank: 1,
      username: "ada",
      displayName: "Ada",
      rating: 1612.4,
      provisional: false,
      attempts: 30,
      solves: 24,
      solveRate: 0.8,
      streakCurrent: 6,
      streakBest: 9,
    },
    {
      rank: 2,
      username: "bob",
      displayName: "Bob",
      rating: 1488.9,
      provisional: true,
      attempts: 3,
      solves: 1,
      solveRate: 1 / 3,
      streakCurrent: 0,
      streakBest: 2,
    },
  ],
};

function renderPage(initialEntry = "/leaderboards"): void {
  render(
    <LoginContext.Provider
      value={{ user: viewer, pass: "pw", reset: () => {}, socket: {} as GameSocket }}
    >
      <MemoryRouter initialEntries={[initialEntry]}>
        <Leaderboards />
      </MemoryRouter>
    </LoginContext.Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Leaderboards: board scope control", () => {
  it("offers Matches and Puzzles scopes, defaulting to the match boards", () => {
    renderPage();
    const toggle = screen.getByTestId("lb-board-scope");
    expect(within(toggle).getByRole("radio", { name: "Matches" })).toBeInTheDocument();
    expect(within(toggle).getByRole("radio", { name: "Puzzles" })).toBeInTheDocument();
    // match grid is up; no puzzle board fetched
    expect(screen.getByTestId("lb-game-tile-nim")).toBeInTheDocument();
    expect(mockedPuzzleBoard).not.toHaveBeenCalled();
  });

  it("switching to Puzzles shows the overall board plus per-game scopes", async () => {
    mockedPuzzleBoard.mockResolvedValue(overallPage);
    renderPage();

    await userEvent.click(screen.getByRole("radio", { name: "Puzzles" }));

    expect(await screen.findByTestId("puzzle-board")).toBeInTheDocument();
    expect(mockedPuzzleBoard).toHaveBeenCalledWith("overall", { page: 1, limit: 50 });
    // scope tiles: overall + one per puzzle game
    expect(screen.getByTestId("lb-puzzle-tile-overall")).toBeInTheDocument();
    expect(screen.getByTestId("lb-puzzle-tile-nim")).toBeInTheDocument();
    // matches never fetched (no game selected on the match side)
    expect(mockedMatchBoard).not.toHaveBeenCalled();
  });

  it("selecting a per-game scope fetches that game's puzzle board", async () => {
    mockedPuzzleBoard.mockResolvedValue({ ...overallPage, scope: "nim" });
    renderPage("/leaderboards?board=puzzles");

    await screen.findByTestId("puzzle-board");
    await userEvent.click(screen.getByTestId("lb-puzzle-tile-nim"));

    await waitFor(() =>
      expect(mockedPuzzleBoard).toHaveBeenCalledWith("nim", { page: 1, limit: 50 }),
    );
  });
});

describe("Leaderboards: puzzle board rows", () => {
  it("renders rank / player / rating / solves / solve-rate / streak per entry", async () => {
    mockedPuzzleBoard.mockResolvedValue(overallPage);
    renderPage("/leaderboards?board=puzzles&game=overall");

    const board = await screen.findByTestId("puzzle-board");
    const rows = within(board).getAllByTestId("puzzle-board-row");
    expect(rows).toHaveLength(2);

    expect(rows[0]).toHaveTextContent("#1");
    expect(rows[0]).toHaveTextContent("Ada");
    expect(rows[0]).toHaveTextContent("1612");
    expect(rows[0]).toHaveTextContent("24/30 solved");
    expect(rows[0]).toHaveTextContent("80%");
    expect(rows[0]).toHaveTextContent("streak 6");
    expect(rows[0]).toHaveTextContent("best 9");

    // provisional rating is marked honestly, and self is flagged
    expect(rows[1]).toHaveTextContent(/provisional/i);
    expect(rows[0]).toHaveTextContent("you");
  });

  it("renders the error state when the fetch fails — no mock fallback", async () => {
    mockedPuzzleBoard.mockRejectedValue(new Error("redis down"));
    renderPage("/leaderboards?board=puzzles&game=overall");

    expect(await screen.findByText(/could not load/i)).toBeInTheDocument();
    expect(screen.queryByTestId("puzzle-board")).not.toBeInTheDocument();
  });

  it("renders the honest empty state when nobody has attempted puzzles", async () => {
    mockedPuzzleBoard.mockResolvedValue({ ...overallPage, total: 0, entries: [] });
    renderPage("/leaderboards?board=puzzles&game=overall");

    expect(await screen.findByTestId("puzzle-board-empty")).toBeInTheDocument();
  });
});
