import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSX } from "react";
import type { PuzzleAttemptResult, SafeUserInfo } from "@gamenite/shared";
import { LoginContext } from "../../contexts/LoginContext.ts";
import type { GameSocket } from "../../util/types.ts";
import type { DailyPuzzle } from "../../services/puzzleMapper.ts";
import { requestPuzzleHint, submitPuzzleAttempt } from "../../services/puzzleService.ts";
import DailyPuzzleCard from "./DailyPuzzleCard.tsx";

vi.mock("../../services/puzzleService.ts", () => ({
  fetchDailyPuzzle: vi.fn(),
  submitPuzzleAttempt: vi.fn(),
  requestPuzzleHint: vi.fn(),
}));

const mockedSubmit = vi.mocked(submitPuzzleAttempt);
const mockedHint = vi.mocked(requestPuzzleHint);

const viewer: SafeUserInfo = { username: "ada", display: "Ada", createdAt: new Date(0) };

const nimPuzzle: DailyPuzzle = {
  gameKey: "nim",
  date: "2026-06-11",
  position: { kind: "nim", view: { remaining: 6, nextPlayer: 0 } },
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
});

describe("DailyPuzzleCard: hints (server round-trip)", () => {
  it("requests the hint with the pinned date and reveals the move as practice-only", async () => {
    mockedHint.mockResolvedValueOnce({ hintMove: 3, explanation: "Leave them 3." });
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
    // the rated slot is forfeit — the UI says so up front
    expectPracticeNote();
    expect(screen.getByTestId("puzzle-practice-note")).toHaveTextContent(/practice/i);
  });

  it("a hinted solve renders the practice verdict (rating frozen)", async () => {
    mockedHint.mockResolvedValueOnce({ hintMove: 3 });
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
