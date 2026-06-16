import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CompareToAIPanel from "./CompareToAIPanel.tsx";
import type {
  AnalysisMoveResult,
  AnalysisResult,
  MatchMoveView,
  ReplayDetail,
} from "../../util/types.ts";

function replay(moves: MatchMoveView[]): ReplayDetail {
  return {
    matchId: "m",
    gameId: "g",
    gameKey: "connect4",
    rated: false,
    participants: [
      { id: "h", type: "human", displayName: "Human" },
      { id: "a", type: "ai", displayName: "Bot" },
    ],
    result: { outcome: "draw" },
    moveCount: moves.length,
    watchCount: 0,
    completedAt: "t",
    moves,
  };
}
function mv(index: number, actor: string, notation: string): MatchMoveView {
  return { index, actor, actorDisplayName: actor, move: index, notation, timestamp: "t" };
}
function analysis(perMove: AnalysisMoveResult[], aiError?: string): AnalysisResult {
  return { matchId: "m", generatedAt: "t", perMove, aiError };
}

describe("CompareToAIPanel", () => {
  it("shows the human move and the deployed model's move", () => {
    render(
      <CompareToAIPanel
        replay={replay([mv(0, "h", "Drop column 1")])}
        gameKey="connect4"
        analysis={analysis([{ moveIndex: 0, flag: "neutral", confidence: 0, engineMove: 3 }])}
        currentMove={0}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Drop column 1")).toBeInTheDocument();
    expect(screen.getByTestId("ai-comparison-model-move").textContent).toContain("Drop column 4");
  });

  it("prompts to pick a model when there is no model move", () => {
    render(
      <CompareToAIPanel
        replay={replay([mv(0, "h", "Drop column 1")])}
        gameKey="connect4"
        analysis={analysis([{ moveIndex: 0, flag: "best", confidence: 1 }])}
        currentMove={0}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByTestId("ai-comparison-model-move")).toBeNull();
    expect(screen.getByText(/Select a deployed model/)).toBeInTheDocument();
  });

  it("notes when the move came from the AI participant", () => {
    render(
      <CompareToAIPanel
        replay={replay([mv(0, "a", "Drop column 2")])}
        gameKey="connect4"
        analysis={analysis([])}
        currentMove={0}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Bot/)).toBeInTheDocument();
  });

  it("surfaces a model error", () => {
    render(
      <CompareToAIPanel
        replay={replay([mv(0, "h", "x")])}
        gameKey="connect4"
        analysis={analysis([], "service down")}
        currentMove={0}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Model insight unavailable/)).toBeInTheDocument();
  });

  it("shows the engine's-view fallback when there is no move at the index", () => {
    render(
      <CompareToAIPanel
        replay={replay([])}
        gameKey="connect4"
        analysis={analysis([])}
        currentMove={0}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/view of the next move/i)).toBeInTheDocument();
  });

  it("fires onClose", () => {
    const onClose = vi.fn();
    render(
      <CompareToAIPanel
        replay={replay([mv(0, "h", "x")])}
        gameKey="connect4"
        analysis={analysis([])}
        currentMove={0}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByLabelText("Close comparison panel"));
    expect(onClose).toHaveBeenCalled();
  });
});
