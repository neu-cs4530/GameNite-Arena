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
});
