import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Connect4View } from "@gamenite/shared";
import type { MatchParticipantView } from "../../util/types.ts";
import Connect4ReplayView from "./Connect4ReplayView.tsx";

const PLAYERS = [{ displayName: "Ada" }, { displayName: "Bob" }] as MatchParticipantView[];

// A tiny 2-row x 3-col board. Column 0 is full (top cell occupied).
const BOARD: Connect4View["board"] = [
  ["R", ".", "."],
  ["Y", ".", "."],
];

describe("Connect4ReplayView", () => {
  it("prompts the next player during an ongoing game", () => {
    const view = { board: BOARD, nextPlayer: 1, winningEntry: null } as Connect4View;
    render(<Connect4ReplayView view={view} participants={PLAYERS} />);
    expect(screen.getByText(/next to move/i)).toHaveTextContent("Bob");
  });

  it("announces the winner and marks the winning cell when the game is over", () => {
    const view = {
      board: BOARD,
      nextPlayer: 1,
      winningEntry: [[0, 0]],
    } as unknown as Connect4View;
    render(<Connect4ReplayView view={view} participants={PLAYERS} />);
    // winner = participants[1 - nextPlayer] = participants[0] = Ada
    expect(screen.getByText(/won/i)).toHaveTextContent("Ada");
  });

  it("renders drop buttons with onColumnClick, disabling full columns", () => {
    const onColumnClick = vi.fn();
    const view = { board: BOARD, nextPlayer: 0, winningEntry: null } as Connect4View;
    render(<Connect4ReplayView view={view} participants={PLAYERS} onColumnClick={onColumnClick} />);

    // Column 0 is full → disabled; column 1 is open → clickable.
    expect(screen.getByTestId("c4-col-0")).toBeDisabled();
    fireEvent.click(screen.getByTestId("c4-col-1"));
    expect(onColumnClick).toHaveBeenCalledWith(1);
  });

  it("shows no drop buttons without onColumnClick", () => {
    const view = { board: BOARD, nextPlayer: 0, winningEntry: null } as Connect4View;
    render(<Connect4ReplayView view={view} participants={PLAYERS} />);
    expect(screen.queryByTestId("c4-col-0")).not.toBeInTheDocument();
  });

  it("uses default disc labels and an em dash when participants are missing", () => {
    const view = { board: BOARD, nextPlayer: 0, winningEntry: null } as Connect4View;
    render(<Connect4ReplayView view={view} participants={[]} />);
    expect(screen.getByText("Red")).toBeInTheDocument();
    expect(screen.getByText("Yellow")).toBeInTheDocument();
    expect(screen.getByText(/next to move/i)).toHaveTextContent("—");
  });

  it("shows an em dash for the winner when participants are missing", () => {
    const view = { board: BOARD, nextPlayer: 1, winningEntry: [[0, 0]] } as unknown as Connect4View;
    render(<Connect4ReplayView view={view} participants={[]} />);
    expect(screen.getByText(/won/i)).toHaveTextContent("—");
  });

  it("highlights the AI landing cell as a green ghost disc on an empty column", () => {
    // Column 1 is empty in both rows; the lowest empty row is row 1.
    const view = { board: BOARD, nextPlayer: 0, winningEntry: null } as Connect4View;
    render(<Connect4ReplayView view={view} participants={PLAYERS} aiMove={1} />);

    const target = screen.getByTestId("c4-ai-target");
    expect(target.className).toContain("c4-cell--ai");
    // Empty target cell renders the AI ghost disc.
    expect(screen.getByLabelText("AI would drop here")).toBeInTheDocument();
  });

  it("lands the AI ghost on the lowest empty row when the column is partly filled", () => {
    // Column 2: top empty, bottom occupied. The reduce must skip the filled
    // bottom row and keep the highest (row 0) empty landing.
    const partial: Connect4View["board"] = [
      ["R", "Y", "."],
      ["Y", "R", "R"],
    ];
    const view = { board: partial, nextPlayer: 0, winningEntry: null } as Connect4View;
    render(<Connect4ReplayView view={view} participants={PLAYERS} aiMove={2} />);

    // Landing row is 0 (only empty cell in column 2), shown at cell 0-2.
    expect(screen.getByTestId("c4-ai-target")).toBe(
      screen.getByLabelText("AI would drop here").parentElement,
    );
  });

  it("does not mark an AI target when the suggested column is out of range", () => {
    const view = { board: BOARD, nextPlayer: 0, winningEntry: null } as Connect4View;
    render(<Connect4ReplayView view={view} participants={PLAYERS} aiMove={99} />);
    expect(screen.queryByTestId("c4-ai-target")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("AI would drop here")).not.toBeInTheDocument();
  });

  it("does not mark an AI target for a negative suggested column", () => {
    const view = { board: BOARD, nextPlayer: 0, winningEntry: null } as Connect4View;
    render(<Connect4ReplayView view={view} participants={PLAYERS} aiMove={-1} />);
    expect(screen.queryByTestId("c4-ai-target")).not.toBeInTheDocument();
  });

  it("ignores the AI suggestion once the game is over", () => {
    const view = {
      board: BOARD,
      nextPlayer: 1,
      winningEntry: [[0, 0]],
    } as unknown as Connect4View;
    render(<Connect4ReplayView view={view} participants={PLAYERS} aiMove={1} />);
    expect(screen.queryByTestId("c4-ai-target")).not.toBeInTheDocument();
  });
});
