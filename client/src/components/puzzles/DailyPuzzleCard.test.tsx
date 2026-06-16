import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSX } from "react";
import {
  HINT_PENALTY,
  type DeploymentView,
  type PuzzleAttemptResult,
  type SafeUserInfo,
} from "@gamenite/shared";
import { LoginContext } from "../../contexts/LoginContext.ts";
import type { GameSocket } from "../../util/types.ts";
import type { DailyPuzzle } from "../../services/puzzleMapper.ts";
import {
  requestPuzzleHint,
  submitAiPuzzleAttempt,
  submitPuzzleAttempt,
} from "../../services/puzzleService.ts";
import { listDeploymentViews } from "../../services/trainerViewService.ts";
import DailyPuzzleCard from "./DailyPuzzleCard.tsx";

vi.mock("../../services/puzzleService.ts", () => ({
  fetchDailyPuzzle: vi.fn(),
  submitPuzzleAttempt: vi.fn(),
  submitAiPuzzleAttempt: vi.fn(),
  requestPuzzleHint: vi.fn(),
}));

vi.mock("../../services/trainerViewService.ts", () => ({
  listDeploymentViews: vi.fn(),
}));

const mockedSubmit = vi.mocked(submitPuzzleAttempt);
const mockedAiSubmit = vi.mocked(submitAiPuzzleAttempt);
const mockedHint = vi.mocked(requestPuzzleHint);
const mockedDeployments = vi.mocked(listDeploymentViews);

/** A deployed nim model eligible to solve the daily puzzle. */
const nimDeployment: DeploymentView = {
  deploymentId: "dep-1",
  modelId: "m-1",
  modelDisplayName: "AlphaNim",
  owner: { username: "ada", display: "Ada" },
  gameKey: "nim",
  displayName: "AlphaNim",
  status: "active",
  hasArtifact: true,
  rating: { rating: 1620, gamesPlayed: 40 },
  createdAt: "2026-06-01",
  updatedAt: "2026-06-10",
};

const viewer: SafeUserInfo = { username: "ada", display: "Ada", createdAt: new Date(0) };

const nimPuzzle: DailyPuzzle = {
  gameKey: "nim",
  date: "2026-06-11",
  position: { kind: "nim", view: { remaining: 6, nextPlayer: 0 } },
  viewerAttempt: null,
};

// A tic-tac-toe puzzle: the BOARD itself is the move picker (click an empty
// cell), so it exercises PuzzleBoard's interactive onSubmit wiring.
const tttPuzzle: DailyPuzzle = {
  gameKey: "tictactoe",
  date: "2026-06-11",
  position: {
    kind: "tictactoe",
    view: {
      board: [
        ["X", "O", "X"],
        [".", "O", "."],
        [".", ".", "."],
      ],
      nextPlayer: 1,
      winningEntry: null,
    },
  },
  viewerAttempt: null,
};

const ratedWin: PuzzleAttemptResult = {
  success: true,
  rated: true,
  eloDelta: 12,
  newRating: { rating: 1512, rd: 120, vol: 0.06 },
  streak: { current: 3, best: 5, lastSolvedAt: "2026-06-11" },
  solutionMove: 3,
  explanation: "Take 3 to leave them 3 — every reply hands you the win.",
};

const practiceWin: PuzzleAttemptResult = { ...ratedWin, rated: false, eloDelta: 0 };

function renderCard(
  puzzle: DailyPuzzle,
  onSolved = vi.fn(),
): { onSolved: ReturnType<typeof vi.fn> } {
  render(
    <LoginContext.Provider
      value={{ user: viewer, pass: "pw", reset: () => {}, socket: {} as GameSocket }}
    >
      <DailyPuzzleCard puzzle={puzzle} onSolved={onSolved} />
    </LoginContext.Provider>,
  );
  return { onSolved };
}

function expectPracticeNote(): JSX.Element | void {
  expect(screen.getByTestId("puzzle-practice-note")).toBeInTheDocument();
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no deployed models, so the Solver picker stays hidden and the
  // existing human-play tests render exactly as before.
  mockedDeployments.mockResolvedValue([]);
});

describe("DailyPuzzleCard: submitting", () => {
  it("echoes the GET's date and measured time — never a hint count", async () => {
    mockedSubmit.mockResolvedValueOnce(ratedWin);
    renderCard(nimPuzzle);

    await userEvent.click(screen.getByTestId("puzzle-take-3"));

    await waitFor(() => expect(mockedSubmit).toHaveBeenCalledTimes(1));
    expect(mockedSubmit).toHaveBeenCalledWith(
      "nim",
      { username: "ada", password: "pw" },
      { move: 3, timeMs: expect.any(Number) as number, date: "2026-06-11" },
    );
    const payload = mockedSubmit.mock.calls[0][2] as Record<string, unknown>;
    expect("hintsUsed" in payload).toBe(false);
  });

  it("renders the verdict from the response: rating, streak, and the revealed solution", async () => {
    mockedSubmit.mockResolvedValueOnce(ratedWin);
    const { onSolved } = renderCard(nimPuzzle);

    await userEvent.click(screen.getByTestId("puzzle-take-3"));

    const result = await screen.findByTestId("puzzle-result");
    expect(result).toHaveTextContent(/solved/i);
    expect(screen.getByTestId("puzzle-glicko-tile")).toHaveTextContent("+12 this attempt");
    expect(screen.getByTestId("puzzle-streak-tile")).toHaveTextContent("3");
    expect(onSolved).toHaveBeenCalledWith("nim");

    // the solution only arrives on the attempt response — and renders from it
    await userEvent.click(screen.getByTestId("puzzle-solution-toggle"));
    expect(screen.getByTestId("puzzle-solution-body")).toHaveTextContent("Take 3");
    expect(screen.getByTestId("puzzle-solution-body")).toHaveTextContent(
      "every reply hands you the win",
    );
  });

  it("shows a retryable error and keeps the board when the POST fails", async () => {
    mockedSubmit.mockRejectedValueOnce(new Error("boom"));
    renderCard(nimPuzzle);

    await userEvent.click(screen.getByTestId("puzzle-take-2"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't submit/i);
    expect(screen.getByTestId("puzzle-take-2")).toBeEnabled();
  });

  it("submits the clicked square when the board itself is the move picker", async () => {
    mockedSubmit.mockResolvedValueOnce(ratedWin);
    renderCard(tttPuzzle);

    // click an empty cell → the board's onSubmit fires with [row, col]
    await userEvent.click(screen.getByTestId("ttt-cell-1-0"));

    await waitFor(() => expect(mockedSubmit).toHaveBeenCalledTimes(1));
    expect(mockedSubmit).toHaveBeenCalledWith(
      "tictactoe",
      { username: "ada", password: "pw" },
      { move: [1, 0], timeMs: expect.any(Number) as number, date: "2026-06-11" },
    );
    await screen.findByTestId("puzzle-result");
  });

  it("retrying a human result reopens an interactive board for another attempt", async () => {
    mockedSubmit.mockResolvedValueOnce(ratedWin);
    renderCard(nimPuzzle);

    await userEvent.click(screen.getByTestId("puzzle-take-3"));
    await screen.findByTestId("puzzle-result");

    // in the result phase the board is read-only (no move buttons)
    expect(screen.queryByTestId("puzzle-take-3")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("puzzle-retry"));
    // back to viewing → the board is interactive again
    expect(screen.getByTestId("puzzle-take-3")).toBeInTheDocument();
    expect(screen.queryByTestId("puzzle-result")).not.toBeInTheDocument();
  });
});

describe("DailyPuzzleCard: hints (server round-trip)", () => {
  it("requests the hint with the pinned date and reveals the move as practice-only", async () => {
    mockedHint.mockResolvedValueOnce({
      hintMove: 3,
      explanation: "Leave them 3.",
      eloDelta: -HINT_PENALTY,
      newRating: { rating: 1495, rd: 350, vol: 0.06 },
    });
    renderCard(nimPuzzle);

    await userEvent.click(screen.getByTestId("puzzle-hint"));

    expect(mockedHint).toHaveBeenCalledWith(
      "nim",
      { username: "ada", password: "pw" },
      "2026-06-11",
    );
    const reveal = await screen.findByTestId("puzzle-hint-reveal");
    expect(reveal).toHaveTextContent("Take 3");
    expect(reveal).toHaveTextContent("Leave them 3.");
    // the penalty shows up right away so it's not a surprise later
    expect(screen.getByTestId("puzzle-hint-penalty")).toHaveTextContent("-5");
    expect(screen.getByTestId("puzzle-hint-penalty")).toHaveTextContent("1495");
    // the rated slot is forfeit — the UI says so up front
    expectPracticeNote();
    expect(screen.getByTestId("puzzle-practice-note")).toHaveTextContent(/practice/i);
  });

  it("a hinted solve renders the practice verdict (rating frozen)", async () => {
    mockedHint.mockResolvedValueOnce({
      hintMove: 3,
      eloDelta: -HINT_PENALTY,
      newRating: { rating: 1495, rd: 350, vol: 0.06 },
    });
    mockedSubmit.mockResolvedValueOnce(practiceWin);
    renderCard(nimPuzzle);

    await userEvent.click(screen.getByTestId("puzzle-hint"));
    await screen.findByTestId("puzzle-hint-reveal");
    await userEvent.click(screen.getByTestId("puzzle-take-3"));

    await screen.findByTestId("puzzle-result");
    expect(screen.getByTestId("puzzle-glicko-tile")).toHaveTextContent(
      "practice — rating unchanged",
    );
  });

  it("keeps the attempt rated when the hint request fails", async () => {
    mockedHint.mockRejectedValueOnce(new Error("down"));
    renderCard(nimPuzzle);

    await userEvent.click(screen.getByTestId("puzzle-hint"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/hint/i);
    expect(screen.queryByTestId("puzzle-hint-reveal")).not.toBeInTheDocument();
    expect(screen.queryByTestId("puzzle-practice-note")).not.toBeInTheDocument();
  });
});

describe("DailyPuzzleCard: viewer standing (?for= fetch)", () => {
  it("shows the real solved-today badge from viewerAttempt", () => {
    renderCard({
      ...nimPuzzle,
      viewerAttempt: { attempted: true, solved: true, rated: true },
    });
    expect(screen.getByTestId("puzzle-card-solved")).toHaveTextContent(/solved today/i);
  });

  it("says further attempts are practice once the rated slot is spent", () => {
    renderCard({
      ...nimPuzzle,
      viewerAttempt: { attempted: true, solved: false, rated: true },
    });
    expectPracticeNote();
    expect(screen.queryByTestId("puzzle-card-solved")).not.toBeInTheDocument();
  });
});

describe("DailyPuzzleCard: solver picker (deployed models)", () => {
  it("renders no Solver picker when the user has no eligible deployments", async () => {
    mockedDeployments.mockResolvedValueOnce([]);
    renderCard(nimPuzzle);
    // give the deployment fetch a chance to resolve before asserting absence
    await waitFor(() => expect(mockedDeployments).toHaveBeenCalled());
    expect(screen.queryByTestId("puzzle-solver-toggle")).not.toBeInTheDocument();
  });

  it("shows the Solver picker and plays the puzzle as human by default", async () => {
    mockedDeployments.mockResolvedValueOnce([nimDeployment]);
    renderCard(nimPuzzle);

    const toggle = await screen.findByTestId("puzzle-solver-toggle");
    // the model's rating shows in its option label
    expect(toggle).toHaveTextContent("AlphaNim · 1620");
    // "Myself" is selected → the human attempt board is interactive
    expect(screen.getByTestId("puzzle-take-3")).toBeInTheDocument();
    expect(screen.queryByTestId("puzzle-ai-solve")).not.toBeInTheDocument();
  });

  it("hands the puzzle to the selected model and rates the solve like a human", async () => {
    mockedDeployments.mockResolvedValueOnce([nimDeployment]);
    mockedAiSubmit.mockResolvedValueOnce(ratedWin);
    const { onSolved } = renderCard(nimPuzzle);

    await screen.findByTestId("puzzle-solver-toggle");
    await userEvent.click(screen.getByRole("radio", { name: "AlphaNim · 1620" }));

    // AI seat: read-only board + the model's attempt note
    expect(screen.getByTestId("puzzle-ai-note")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("puzzle-ai-solve"));

    expect(mockedAiSubmit).toHaveBeenCalledWith(
      "nim",
      { username: "ada", password: "pw" },
      "dep-1",
      "2026-06-11",
    );
    await screen.findByTestId("puzzle-result");
    expect(onSolved).toHaveBeenCalledWith("nim");
  });

  it("surfaces an error when the model can't attempt and keeps the solve button", async () => {
    mockedDeployments.mockResolvedValueOnce([nimDeployment]);
    mockedAiSubmit.mockRejectedValueOnce(new Error("offline"));
    const { onSolved } = renderCard(nimPuzzle);

    await screen.findByTestId("puzzle-solver-toggle");
    await userEvent.click(screen.getByRole("radio", { name: "AlphaNim · 1620" }));
    await userEvent.click(screen.getByTestId("puzzle-ai-solve"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't attempt/i);
    expect(screen.getByTestId("puzzle-ai-solve")).toBeInTheDocument();
    expect(onSolved).not.toHaveBeenCalled();
    expect(screen.queryByTestId("puzzle-result")).not.toBeInTheDocument();
  });

  it("retrying an AI result returns to the model's attempt note", async () => {
    mockedDeployments.mockResolvedValueOnce([nimDeployment]);
    mockedAiSubmit.mockResolvedValueOnce(ratedWin);
    renderCard(nimPuzzle);

    await screen.findByTestId("puzzle-solver-toggle");
    await userEvent.click(screen.getByRole("radio", { name: "AlphaNim · 1620" }));
    await userEvent.click(screen.getByTestId("puzzle-ai-solve"));
    await screen.findByTestId("puzzle-result");

    await userEvent.click(screen.getByTestId("puzzle-retry"));
    expect(screen.getByTestId("puzzle-ai-note")).toBeInTheDocument();
    expect(screen.queryByTestId("puzzle-result")).not.toBeInTheDocument();
  });

  it("switching back to Myself clears the AI sub-state", async () => {
    mockedDeployments.mockResolvedValueOnce([nimDeployment]);
    mockedAiSubmit.mockResolvedValueOnce(ratedWin);
    renderCard(nimPuzzle);

    await screen.findByTestId("puzzle-solver-toggle");
    await userEvent.click(screen.getByRole("radio", { name: "AlphaNim · 1620" }));
    await userEvent.click(screen.getByTestId("puzzle-ai-solve"));
    await screen.findByTestId("puzzle-result");

    // back to "Myself" → human board returns, AI result is gone
    await userEvent.click(screen.getByRole("radio", { name: "Myself" }));
    expect(screen.getByTestId("puzzle-take-3")).toBeInTheDocument();
    expect(screen.queryByTestId("puzzle-result")).not.toBeInTheDocument();
  });

  it("resets the AI sub-state when the puzzle day flips", async () => {
    mockedDeployments.mockResolvedValue([nimDeployment]);
    mockedAiSubmit.mockResolvedValueOnce(ratedWin);
    const { rerender } = render(
      <LoginContext.Provider
        value={{ user: viewer, pass: "pw", reset: () => {}, socket: {} as GameSocket }}
      >
        <DailyPuzzleCard puzzle={nimPuzzle} onSolved={vi.fn()} />
      </LoginContext.Provider>,
    );

    await screen.findByTestId("puzzle-solver-toggle");
    await userEvent.click(screen.getByRole("radio", { name: "AlphaNim · 1620" }));
    await userEvent.click(screen.getByTestId("puzzle-ai-solve"));
    await screen.findByTestId("puzzle-result");

    // a new puzzle day arrives → solver resets to Myself, AI result cleared
    rerender(
      <LoginContext.Provider
        value={{ user: viewer, pass: "pw", reset: () => {}, socket: {} as GameSocket }}
      >
        <DailyPuzzleCard puzzle={{ ...nimPuzzle, date: "2026-06-12" }} onSolved={vi.fn()} />
      </LoginContext.Provider>,
    );

    expect(screen.getByTestId("puzzle-take-3")).toBeInTheDocument();
    expect(screen.queryByTestId("puzzle-result")).not.toBeInTheDocument();
  });

  it("renders without a picker when the deployment list can't load", async () => {
    mockedDeployments.mockRejectedValueOnce(new Error("list down"));
    renderCard(nimPuzzle);
    await waitFor(() => expect(mockedDeployments).toHaveBeenCalled());
    // best-effort: the card still plays human-only
    expect(screen.queryByTestId("puzzle-solver-toggle")).not.toBeInTheDocument();
    expect(screen.getByTestId("puzzle-take-3")).toBeInTheDocument();
  });

  it("ignores a late deployment list resolved after the card unmounts", async () => {
    // Resolve only after we've torn the card down, so the effect cleanup has
    // flipped `active` to false and the picker is never populated.
    let resolveList: (views: DeploymentView[]) => void = () => {};
    mockedDeployments.mockReturnValueOnce(
      new Promise<DeploymentView[]>((resolve) => {
        resolveList = resolve;
      }),
    );
    const { unmount } = render(
      <LoginContext.Provider
        value={{ user: viewer, pass: "pw", reset: () => {}, socket: {} as GameSocket }}
      >
        <DailyPuzzleCard puzzle={nimPuzzle} onSolved={vi.fn()} />
      </LoginContext.Provider>,
    );
    await waitFor(() => expect(mockedDeployments).toHaveBeenCalled());

    unmount();
    // the fetch comes back after teardown → the `active` guard drops it
    resolveList([nimDeployment]);
    await Promise.resolve();
    expect(screen.queryByTestId("puzzle-solver-toggle")).not.toBeInTheDocument();
  });
});
