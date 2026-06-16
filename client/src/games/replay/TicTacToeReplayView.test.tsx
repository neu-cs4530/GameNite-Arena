import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { TicTacToeView } from "@gamenite/shared";
import type { MatchParticipantView } from "../../util/types.ts";
import TicTacToeReplayView from "./TicTacToeReplayView.tsx";

const PLAYERS = [{ displayName: "Ada" }, { displayName: "Bob" }] as MatchParticipantView[];

// 3x3 board: one O placed, rest empty.
const EMPTY_BOARD: TicTacToeView["board"] = [
  ["O", ".", "."],
  [".", ".", "."],
  [".", ".", "."],
];

describe("TicTacToeReplayView", () => {
  it("prompts the next player during an ongoing game", () => {
    const view = { board: EMPTY_BOARD, nextPlayer: 1, winningEntry: null } as TicTacToeView;
    render(<TicTacToeReplayView view={view} participants={PLAYERS} />);
    expect(screen.getByText(/next to move/i)).toHaveTextContent("Bob");
  });

  it("announces the winner when the game is over", () => {
    const view = {
      board: EMPTY_BOARD,
      nextPlayer: 1,
      winningEntry: [[0, 0]],
    } as unknown as TicTacToeView;
    render(<TicTacToeReplayView view={view} participants={PLAYERS} />);
    // winnerIndex = 1 - nextPlayer = 0 → Ada
    expect(screen.getByText(/game over/i)).toHaveTextContent("Ada");
    expect(screen.getByTestId("ttt-cell-0-0").className).toContain("ttt-cell--winner");
  });

  it("makes empty cells clickable when onCellClick is provided", () => {
    const onCellClick = vi.fn();
    const view = { board: EMPTY_BOARD, nextPlayer: 0, winningEntry: null } as TicTacToeView;
    render(<TicTacToeReplayView view={view} participants={PLAYERS} onCellClick={onCellClick} />);

    // The filled (0,0) cell is not a button; an empty one is.
    fireEvent.click(screen.getByTestId("ttt-cell-1-1"));
    expect(onCellClick).toHaveBeenCalledWith(1, 1);
  });

  it("stays read-only without onCellClick (no playable buttons)", () => {
    const view = { board: EMPTY_BOARD, nextPlayer: 0, winningEntry: null } as TicTacToeView;
    render(<TicTacToeReplayView view={view} participants={PLAYERS} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("TicTacToeReplayView AI + engine highlights", () => {
  const ongoing = () =>
    ({ board: EMPTY_BOARD, nextPlayer: 1, winningEntry: null }) as TicTacToeView;

  it("marks the AI's suggested empty cell green", () => {
    render(<TicTacToeReplayView view={ongoing()} participants={PLAYERS} aiMove={[1, 1]} />);
    expect(screen.getByTestId("ttt-cell-1-1").className).toContain("ttt-cell--ai");
    expect(screen.getByTestId("ttt-ai-target")).toBeInTheDocument();
  });

  it("tints the played cell by engine quality, but not for neutral", () => {
    const view = ongoing();
    const { rerender } = render(
      <TicTacToeReplayView
        view={view}
        participants={PLAYERS}
        engineMoveQuality={{ move: [0, 0], flag: "blunder" }}
      />,
    );
    expect(screen.getByTestId("ttt-cell-0-0").className).toContain("ttt-cell--eng-blunder");

    for (const flag of ["best", "inaccuracy"] as const) {
      rerender(
        <TicTacToeReplayView
          view={view}
          participants={PLAYERS}
          engineMoveQuality={{ move: [0, 0], flag }}
        />,
      );
      expect(screen.getByTestId("ttt-cell-0-0").className).toContain(`ttt-cell--eng-${flag}`);
    }

    rerender(
      <TicTacToeReplayView
        view={view}
        participants={PLAYERS}
        engineMoveQuality={{ move: [0, 0], flag: "neutral" }}
      />,
    );
    expect(screen.getByTestId("ttt-cell-0-0").className).not.toContain("ttt-cell--eng");
  });
});
