import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import EngineInsightPanel, { engineVerdict } from "./EngineInsightPanel.tsx";
import type { AnalysisMoveResult } from "../../util/types.ts";

function item(over: Partial<AnalysisMoveResult> = {}): AnalysisMoveResult {
  return { moveIndex: 0, flag: "best", confidence: 1, ...over };
}

describe("engineVerdict", () => {
  it("maps each flag to a headline", () => {
    expect(engineVerdict("nim", item({ flag: "best" }), 1).headline).toBe("Best move");
    expect(engineVerdict("nim", item({ flag: "blunder" }), 1).headline).toBe("Blunder");
    expect(engineVerdict("nim", item({ flag: "inaccuracy" }), 1).headline).toBe("Inaccuracy");
    expect(engineVerdict("nim", item({ flag: "neutral" }), 1).headline).toBe("No better move");
  });

  it("describes the played move", () => {
    expect(engineVerdict("nim", item(), 2).played).toBe("Take 2");
  });

  it("includes the engine's best move only when present", () => {
    expect(engineVerdict("nim", item({ suggestedMove: 1 }), 3).best).toBe("Take 1");
    expect(engineVerdict("nim", item(), 3).best).toBeUndefined();
  });

  it("includes notes only when non-empty", () => {
    expect(engineVerdict("nim", item({ notes: "hi" }), 1).notes).toBe("hi");
    expect(engineVerdict("nim", item({ notes: "" }), 1).notes).toBeUndefined();
    expect(engineVerdict("nim", item(), 1).notes).toBeUndefined();
  });
});

describe("EngineInsightPanel", () => {
  it("renders headline, played, best line and notes for a blunder", () => {
    render(
      <EngineInsightPanel
        gameKey="nim"
        item={item({ flag: "blunder", suggestedMove: 1, notes: "Take 1 was winning." })}
        playedMove={3}
        moveNumber={2}
      />,
    );
    expect(screen.getByTestId("engine-insight-headline").textContent).toBe("Blunder");
    expect(screen.getByTestId("engine-insight").className).toContain("ga-engine-insight--blunder");
    expect(screen.getByTestId("engine-insight-best").textContent).toContain("Take 1");
    expect(screen.getByText("Take 1 was winning.")).toBeInTheDocument();
    expect(screen.getByText(/Move 2/)).toBeInTheDocument();
  });

  it("omits the best line and notes for a best move", () => {
    render(
      <EngineInsightPanel
        gameKey="nim"
        item={item({ flag: "best" })}
        playedMove={1}
        moveNumber={1}
      />,
    );
    expect(screen.getByTestId("engine-insight").className).toContain("ga-engine-insight--best");
    expect(screen.queryByTestId("engine-insight-best")).toBeNull();
  });
});
