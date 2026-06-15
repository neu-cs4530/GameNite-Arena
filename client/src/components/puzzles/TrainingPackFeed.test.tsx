import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SafeUserInfo, TrainingPackEntry } from "@gamenite/shared";
import { LoginContext } from "../../contexts/LoginContext.ts";
import type { GameSocket } from "../../util/types.ts";
import { fetchTrainingPack, submitTrainingAttempt } from "../../services/puzzleService.ts";
import TrainingPackFeed from "./TrainingPackFeed.tsx";

vi.mock("../../services/puzzleService.ts", () => ({
  fetchTrainingPack: vi.fn(),
  submitTrainingAttempt: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchTrainingPack);
const mockedSubmit = vi.mocked(submitTrainingAttempt);

const viewer: SafeUserInfo = { username: "ada", display: "Ada", createdAt: new Date(0) };

function entry(sourceMatchId: string, remaining = 5): TrainingPackEntry {
  return {
    gameKey: "nim",
    position: { remaining, nextPlayer: 0 },
    sourceMatchId,
    createdAt: "2026-06-09T00:30:00.000Z",
  };
}

function renderFeed(): void {
  render(
    <LoginContext.Provider
      value={{ user: viewer, pass: "pw", reset: () => {}, socket: {} as GameSocket }}
    >
      <TrainingPackFeed gameKey="nim" />
    </LoginContext.Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TrainingPackFeed: loading, empty, error", () => {
  it("shows a loading card while the first batch is in flight", () => {
    mockedFetch.mockReturnValue(new Promise(() => {}));
    renderFeed();
    expect(screen.getByTestId("training-feed-loading")).toBeInTheDocument();
  });

  it("shows an empty state when there are no practice puzzles yet", async () => {
    mockedFetch.mockResolvedValueOnce([]);
    renderFeed();
    expect(await screen.findByTestId("training-feed-empty")).toBeInTheDocument();
  });

  it("shows a retryable error state when the fetch fails", async () => {
    mockedFetch.mockRejectedValueOnce(new Error("boom"));
    renderFeed();
    expect(await screen.findByTestId("training-feed-error")).toBeInTheDocument();
  });
});

describe("TrainingPackFeed: entries and attempts", () => {
  it("renders one card per entry", async () => {
    mockedFetch.mockResolvedValueOnce([entry("match-1"), entry("match-2")]);
    renderFeed();

    expect(await screen.findAllByTestId("training-card")).toHaveLength(2);
  });

  it("submits an attempt and reveals the pass/fail result", async () => {
    mockedFetch.mockResolvedValueOnce([entry("match-1")]);
    mockedSubmit.mockResolvedValueOnce({
      success: true,
      solutionMove: 3,
      explanation: "Take 3 to leave them 1.",
    });
    renderFeed();

    await screen.findByTestId("training-card");
    await userEvent.click(screen.getByTestId("puzzle-take-3"));

    const result = await screen.findByTestId("training-result");
    expect(result).toHaveTextContent(/solved/i);
    expect(result).toHaveTextContent("Take 3");
    expect(result).toHaveTextContent("Take 3 to leave them 1.");
    expect(mockedSubmit).toHaveBeenCalledWith(
      "nim",
      { username: "ada", password: "pw" },
      { sourceMatchId: "match-1", move: 3 },
    );
  });
});

describe("TrainingPackFeed: load more", () => {
  it("appends the next batch and excludes already-seen sourceMatchIds", async () => {
    mockedFetch.mockResolvedValueOnce([entry("match-1")]);
    renderFeed();

    expect(await screen.findAllByTestId("training-card")).toHaveLength(1);

    mockedFetch.mockResolvedValueOnce([entry("match-2")]);
    await userEvent.click(screen.getByTestId("training-load-more"));

    await waitFor(() => expect(screen.getAllByTestId("training-card")).toHaveLength(2));
    expect(mockedFetch).toHaveBeenLastCalledWith("nim", { limit: 5, exclude: ["match-1"] });
  });
});
