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

  it("shows an em dash for the next player when participants are missing", () => {
    const view = { board: EMPTY_BOARD, nextPlayer: 0, winningEntry: null } as TicTacToeView;
    render(<TicTacToeReplayView view={view} participants={[]} />);
    expect(screen.getByText(/next to move/i)).toHaveTextContent("—");
  });

  it("shows an em dash for the winner when participants are missing", () => {
    const view = {
      board: EMPTY_BOARD,
      nextPlayer: 1,
      winningEntry: [[0, 0]],
    } as unknown as TicTacToeView;
    render(<TicTacToeReplayView view={view} participants={[]} />);
    expect(screen.getByText(/game over/i)).toHaveTextContent("—");
  });

  it("renders an X mark for player 1's placed cell", () => {
    // nextPlayer 0 means O is up next; an "X" already on the board exercises
    // the X branch of renderMark.
    const board: TicTacToeView["board"] = [
      ["X", ".", "."],
      [".", ".", "."],
      [".", ".", "."],
    ];
    const view = { board, nextPlayer: 0, winningEntry: null } as TicTacToeView;
    render(<TicTacToeReplayView view={view} participants={PLAYERS} />);
    const cell = screen.getByTestId("ttt-cell-0-0");
    expect(cell.querySelector(".ttt-mark--x")).not.toBeNull();
    expect(cell).toHaveTextContent("X");
  });

  it("ghosts the AI target on an empty cell using the mover's mark", () => {
    // nextPlayer 0 → me = "O"; AI suggests empty cell (1,1).
    const view = { board: EMPTY_BOARD, nextPlayer: 0, winningEntry: null } as TicTacToeView;
    render(<TicTacToeReplayView view={view} participants={PLAYERS} aiMove={[1, 1]} />);

    const target = screen.getByTestId("ttt-ai-target");
    expect(target).toHaveTextContent("O");
    expect(screen.getByTestId("ttt-cell-1-1").className).toContain("ttt-cell--ai");
  });

  it("does not ghost the AI target on an occupied cell", () => {
    // AI "suggests" (0,0), which already holds O → isAiTarget is false.
    const view = { board: EMPTY_BOARD, nextPlayer: 0, winningEntry: null } as TicTacToeView;
    render(<TicTacToeReplayView view={view} participants={PLAYERS} aiMove={[0, 0]} />);
    expect(screen.queryByTestId("ttt-ai-target")).not.toBeInTheDocument();
  });

  it("ignores the AI suggestion once the game is over", () => {
    const view = {
      board: EMPTY_BOARD,
      nextPlayer: 0,
      winningEntry: [[2, 2]],
    } as unknown as TicTacToeView;
    render(<TicTacToeReplayView view={view} participants={PLAYERS} aiMove={[1, 1]} />);
    expect(screen.queryByTestId("ttt-ai-target")).not.toBeInTheDocument();
  });

  it("renders an AI ghost as the X mark when player 1 is to move", () => {
    // nextPlayer 1 → me = "X"; AI ghost at empty (2,2).
    const view = { board: EMPTY_BOARD, nextPlayer: 1, winningEntry: null } as TicTacToeView;
    render(<TicTacToeReplayView view={view} participants={PLAYERS} aiMove={[2, 2]} />);
    expect(screen.getByTestId("ttt-ai-target")).toHaveTextContent("X");
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
