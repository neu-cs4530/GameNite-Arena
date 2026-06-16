import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PuzzleAttemptResult } from "@gamenite/shared";
import ResultPanel from "./ResultPanel.tsx";

const base: PuzzleAttemptResult = {
  success: true,
  rated: true,
  eloDelta: 12,
  newRating: { rating: 1512, rd: 120, vol: 0.06 },
  streak: { current: 3, best: 5 },
  solutionMove: 3,
  explanation: "Take 3.",
};

describe("ResultPanel — success", () => {
  it("shows the solved headline and success modifier", () => {
    render(
      <ResultPanel
        gameKey="nim"
        result={base}
        solutionOpen={false}
        onSolutionToggle={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByTestId("puzzle-result")).toHaveClass("ga-puzzle-result--success");
    expect(screen.getByTestId("puzzle-result")).toHaveTextContent(/Solved/);
  });
});

describe("ResultPanel — failure", () => {
  it("shows the fail headline and fail modifier", () => {
    render(
      <ResultPanel
        gameKey="nim"
        result={{ ...base, success: false, eloDelta: -8 }}
        solutionOpen={false}
        onSolutionToggle={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByTestId("puzzle-result")).toHaveClass("ga-puzzle-result--fail");
    expect(screen.getByTestId("puzzle-result")).toHaveTextContent(/Not this time/);
  });
});
