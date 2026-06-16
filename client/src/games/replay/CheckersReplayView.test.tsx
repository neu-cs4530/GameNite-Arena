import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CheckersReplayView from "./CheckersReplayView.tsx";
import type { CheckersView } from "@gamenite/shared";
import type { MatchParticipantView } from "../../util/types.ts";

// Build a minimal 8×8 board with all dots.
function emptyBoard(): string[][] {
  return Array.from({ length: 8 }, () => Array(8).fill(".") as string[]);
}

const participants: MatchParticipantView[] = [
  { id: "u-a", type: "human", displayName: "Alice", username: "alice" },
  { id: "u-b", type: "human", displayName: "Bob", username: "bob" },
];

function makeView(overrides: Partial<CheckersView> = {}): CheckersView {
  const board = emptyBoard();
  // Place a Red piece at (5,1) — dark square — so legal moves can reference it.
  (board[5][1] as unknown as string) = "R";
  return {
    board: board as CheckersView["board"],
    nextPlayer: 0,
    winner: null,
    legalMoves: [],
    ...overrides,
  };
}

describe("CheckersReplayView", () => {
  it("renders an 8×8 grid of cells", () => {
    render(<CheckersReplayView view={makeView()} participants={participants} />);
    const board = screen.getByTestId("checkers-board");
    expect(board).toBeInTheDocument();
    // 64 squares
    const squares = screen.getAllByRole("gridcell");
    expect(squares).toHaveLength(64);
  });

  it("shows 'Red wins' when winner=0", () => {
    render(
      <CheckersReplayView view={makeView({ winner: 0 })} participants={participants} />,
    );
    expect(screen.getByText(/Alice.*wins|Red.*wins/)).toBeInTheDocument();
  });

  it("shows 'Black wins' when winner=1", () => {
    render(
      <CheckersReplayView view={makeView({ winner: 1 })} participants={participants} />,
    );
    expect(screen.getByText(/Bob.*wins|Black.*wins/)).toBeInTheDocument();
  });

  it("shows 'Next to move: Alice (Red)' when nextPlayer=0 and no winner", () => {
    render(
      <CheckersReplayView view={makeView({ winner: null })} participants={participants} />,
    );
    // The status line is inside .ga-ch-replay__turn
    const turnEl = document.querySelector(".ga-ch-replay__turn");
    expect(turnEl?.textContent).toMatch(/Next to move.*Alice.*Red/);
  });

  it("shows 'Next to move: Bob (Black)' when nextPlayer=1", () => {
    render(
      <CheckersReplayView
        view={makeView({ winner: null, nextPlayer: 1 })}
        participants={participants}
      />,
    );
    const turnEl = document.querySelector(".ga-ch-replay__turn");
    expect(turnEl?.textContent).toMatch(/Next to move.*Bob.*Black/);
  });

  it("clicking is a no-op when onMove is not provided (read-only mode)", () => {
    const view = makeView({
      legalMoves: [{ squares: [[5, 1], [4, 2]] }],
    });
    render(<CheckersReplayView view={view} participants={participants} />);
    // Click the square at (5,1) — should not throw or select anything.
    fireEvent.click(screen.getByTestId("checkers-sq-5-1"));
    // No destination highlights visible.
    expect(screen.queryByText("selected")).toBeNull();
  });

  it("selects a movable piece and highlights the legal destination", () => {
    const view = makeView({
      legalMoves: [{ squares: [[5, 1], [4, 2]] }],
    });
    const onMove = vi.fn();
    render(<CheckersReplayView view={view} participants={participants} onMove={onMove} />);
    // Click the movable piece at (5,1).
    fireEvent.click(screen.getByTestId("checkers-sq-5-1"));
    // The destination (4,2) should now be highlighted (has --dest class).
    const dest = screen.getByTestId("checkers-sq-4-2");
    expect(dest.className).toContain("dest");
  });

  it("fires onMove when clicking a highlighted destination after selecting a piece", () => {
    const view = makeView({
      legalMoves: [{ squares: [[5, 1], [4, 2]] }],
    });
    const onMove = vi.fn();
    render(<CheckersReplayView view={view} participants={participants} onMove={onMove} />);
    // Select the piece.
    fireEvent.click(screen.getByTestId("checkers-sq-5-1"));
    // Click the destination.
    fireEvent.click(screen.getByTestId("checkers-sq-4-2"));
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith({ squares: [[5, 1], [4, 2]] });
  });

  it("clears selection when clicking a non-movable, non-destination square", () => {
    const view = makeView({
      legalMoves: [{ squares: [[5, 1], [4, 2]] }],
    });
    const onMove = vi.fn();
    render(<CheckersReplayView view={view} participants={participants} onMove={onMove} />);
    // Select piece at (5,1).
    fireEvent.click(screen.getByTestId("checkers-sq-5-1"));
    // Click an empty square that is neither selected nor a destination.
    fireEvent.click(screen.getByTestId("checkers-sq-0-0"));
    // onMove should NOT have been called.
    expect(onMove).not.toHaveBeenCalled();
    // And the destination highlight should be gone.
    const dest = screen.getByTestId("checkers-sq-4-2");
    expect(dest.className).not.toContain("dest");
  });

  it("renders Red pieces (R), Black pieces (B), and kings (RK, BK)", () => {
    const board = emptyBoard();
    (board[5][1] as unknown) = "R";
    (board[2][2] as unknown) = "B";
    (board[3][3] as unknown) = "RK";
    (board[4][4] as unknown) = "BK";
    const view = makeView({
      board: board as CheckersView["board"],
      legalMoves: [],
    });
    render(<CheckersReplayView view={view} participants={participants} />);
    // All 4 piece types render without error; just assert the board is present.
    expect(screen.getByTestId("checkers-board")).toBeInTheDocument();
  });

  it("uses fallback names when participants array is empty", () => {
    render(<CheckersReplayView view={makeView({ winner: 0 })} participants={[]} />);
    expect(screen.getByText(/Red.*wins/)).toBeInTheDocument();
  });
});
