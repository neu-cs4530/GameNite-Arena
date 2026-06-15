import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { SafeUserInfo } from "@gamenite/shared";
import { LoginContext } from "../contexts/LoginContext.ts";
import type { GameSocket } from "../util/types.ts";
import { fetchTrainingPack } from "../services/puzzleService.ts";
import Practice from "./Practice.tsx";

vi.mock("../services/puzzleService.ts", () => ({
  fetchTrainingPack: vi.fn(),
  submitTrainingAttempt: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchTrainingPack);

const viewer: SafeUserInfo = { username: "ada", display: "Ada", createdAt: new Date(0) };

function renderPage(initialEntry = "/puzzles/practice"): void {
  render(
    <LoginContext.Provider
      value={{ user: viewer, pass: "pw", reset: () => {}, socket: {} as GameSocket }}
    >
      <MemoryRouter initialEntries={[initialEntry]}>
        <Practice />
      </MemoryRouter>
    </LoginContext.Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Practice page", () => {
  it("renders the page shell with no game selected", () => {
    renderPage();
    expect(screen.getByTestId("practice-page")).toBeInTheDocument();
    expect(screen.getByTestId("practice-game-tile-nim")).toBeInTheDocument();
  });

  it("selecting a game's tile shows that game's training feed", async () => {
    mockedFetch.mockResolvedValue([]);
    renderPage("/puzzles/practice?game=nim");

    expect(await screen.findByTestId("training-feed-empty")).toBeInTheDocument();
    expect(mockedFetch).toHaveBeenCalledWith("nim", { limit: 5 });
  });
});
