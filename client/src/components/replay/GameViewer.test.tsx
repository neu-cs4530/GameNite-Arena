import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TaggedGameView } from "@gamenite/shared";
import GameViewer from "./GameViewer.tsx";
import type { ReplayDetail } from "../../util/types.ts";

// Stub the per-game views so this exercises only GameViewer's dispatch + the
// move-parsing it does before handing off.
vi.mock("../../games/replay/NimReplayView.tsx", () => ({
  default: () => <div data-testid="view-nim" />,
}));
vi.mock("../../games/replay/GuessReplayView.tsx", () => ({
  default: () => <div data-testid="view-guess" />,
}));
vi.mock("../../games/replay/CheckersReplayView.tsx", () => ({
  default: () => <div data-testid="view-checkers" />,
}));
vi.mock("../../games/replay/Connect4ReplayView.tsx", () => ({
  default: (p: { aiMove?: unknown }) => (
    <div data-testid="view-connect4" data-ai={JSON.stringify(p.aiMove ?? null)} />
  ),
}));
vi.mock("../../games/replay/TicTacToeReplayView.tsx", () => ({
  default: (p: { aiMove?: unknown; engineMoveQuality?: unknown }) => (
    <div
      data-testid="view-tictactoe"
      data-ai={JSON.stringify(p.aiMove ?? null)}
      data-eng={JSON.stringify(p.engineMoveQuality ?? null)}
    />
  ),
}));
vi.mock("../../games/replay/StubReplayView.tsx", () => ({
  default: () => <div data-testid="view-stub" />,
}));

function replay(over: Partial<ReplayDetail> = {}): ReplayDetail {
  return {
    matchId: "m",
    gameId: "g",
    gameKey: "nim",
    rated: false,
    participants: [],
    result: { outcome: "draw" },
    moveCount: 0,
    watchCount: 0,
    completedAt: "t",
    moves: [],
    initialState: { remaining: 21 },
    ...over,
  };
}
const tagged = (type: string, v: unknown = {}): TaggedGameView =>
  ({ type, view: v }) as unknown as TaggedGameView;

describe("GameViewer dispatch", () => {
  it("renders the nim view", () => {
    render(<GameViewer view={tagged("nim", { remaining: 5, nextPlayer: 0 })} replay={replay()} />);
    expect(screen.getByTestId("view-nim")).toBeInTheDocument();
  });

  it("renders the nim view with the fallback starting pile (no initial state)", () => {
    render(
      <GameViewer
        view={tagged("nim", { remaining: 5, nextPlayer: 0 })}
        replay={replay({ initialState: undefined })}
      />,
    );
    expect(screen.getByTestId("view-nim")).toBeInTheDocument();
  });

  it("renders the guess view", () => {
    render(<GameViewer view={tagged("guess")} replay={replay({ gameKey: "guess" })} />);
    expect(screen.getByTestId("view-guess")).toBeInTheDocument();
  });

  it("renders the checkers view", () => {
    render(<GameViewer view={tagged("checkers")} replay={replay({ gameKey: "checkers" })} />);
    expect(screen.getByTestId("view-checkers")).toBeInTheDocument();
  });

  it("falls back to the stub when there is no derived view", () => {
    render(<GameViewer view={null} replay={replay()} />);
    expect(screen.getByTestId("view-stub")).toBeInTheDocument();
  });
});

describe("GameViewer tic-tac-toe AI + engine props", () => {
  it("forwards a valid aiMove and engineQuality", () => {
    render(
      <GameViewer
        view={tagged("tictactoe")}
        replay={replay({ gameKey: "tictactoe" })}
        aiMove={[0, 1]}
        engineQuality={{ move: [1, 1], flag: "blunder" }}
      />,
    );
    const el = screen.getByTestId("view-tictactoe");
    expect(el.getAttribute("data-ai")).toBe("[0,1]");
    expect(el.getAttribute("data-eng")).toContain("blunder");
  });

  it("drops an invalid aiMove and engineQuality move", () => {
    render(
      <GameViewer
        view={tagged("tictactoe")}
        replay={replay({ gameKey: "tictactoe" })}
        aiMove={"nope"}
        engineQuality={{ move: "nope", flag: "best" }}
      />,
    );
    const el = screen.getByTestId("view-tictactoe");
    expect(el.getAttribute("data-ai")).toBe("null");
    expect(el.getAttribute("data-eng")).toBe("null");
  });

  it("handles no engineQuality at all", () => {
    render(
      <GameViewer
        view={tagged("tictactoe")}
        replay={replay({ gameKey: "tictactoe" })}
        aiMove={[2, 2]}
      />,
    );
    expect(screen.getByTestId("view-tictactoe").getAttribute("data-eng")).toBe("null");
  });
});

describe("GameViewer connect4 AI prop", () => {
  it("forwards a valid column aiMove", () => {
    render(
      <GameViewer view={tagged("connect4")} replay={replay({ gameKey: "connect4" })} aiMove={3} />,
    );
    expect(screen.getByTestId("view-connect4").getAttribute("data-ai")).toBe("3");
  });

  it("drops an out-of-range column aiMove", () => {
    render(
      <GameViewer view={tagged("connect4")} replay={replay({ gameKey: "connect4" })} aiMove={99} />,
    );
    expect(screen.getByTestId("view-connect4").getAttribute("data-ai")).toBe("null");
  });
});
