import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CheckersBoard, CheckersEntry, Connect4Board, Connect4Entry } from "@gamenite/shared";
import type { PuzzlePosition } from "../../services/puzzleMapper.ts";
import PuzzleBoard from "./PuzzleBoard.tsx";

/** Builds a 6x7 connect4 board, "." everywhere except the given squares. */
function connect4Board(pieces: Record<string, Connect4Entry>): Connect4Board {
  const board: Connect4Board = Array.from({ length: 6 }, () =>
    Array.from({ length: 7 }, () => "."),
  );
  for (const [key, entry] of Object.entries(pieces)) {
    const [row, col] = key.split(",").map(Number);
    board[row][col] = entry;
  }
  return board;
}

/** Builds an 8x8 checkers board, "." everywhere except the given squares. */
function checkersBoard(pieces: Record<string, CheckersEntry>): CheckersBoard {
  const board: CheckersBoard = Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () => "."),
  );
  for (const [key, entry] of Object.entries(pieces)) {
    const [row, col] = key.split(",").map(Number);
    board[row][col] = entry;
  }
  return board;
}

describe("PuzzleBoard (nim)", () => {
  it("renders the nim board", () => {
    const position: PuzzlePosition = { kind: "nim", view: { remaining: 6, nextPlayer: 0 } };
    render(<PuzzleBoard position={position} />);

    expect(screen.getByTestId("puzzle-board-nim")).toBeInTheDocument();
  });
});

describe("PuzzleBoard (guess)", () => {
  it("renders the guess context", () => {
    const position: PuzzlePosition = {
      kind: "guess",
      view: { finished: false, guesses: [true, false] },
    };
    render(<PuzzleBoard position={position} />);

    expect(screen.getByTestId("puzzle-board-guess")).toHaveTextContent("1 of 2");
  });
});

describe("PuzzleBoard (tictactoe)", () => {
  const position: PuzzlePosition = {
    kind: "tictactoe",
    view: {
      board: [
        ["X", "X", "."],
        ["O", "O", "."],
        [".", ".", "."],
      ],
      nextPlayer: 1,
      winningEntry: null,
    },
  };

  it("submits the clicked empty cell", async () => {
    const onSubmit = vi.fn();
    render(<PuzzleBoard position={position} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByTestId("ttt-cell-0-2"));

    expect(onSubmit).toHaveBeenCalledWith([0, 2]);
  });

  it("ignores clicks while disabled", () => {
    const onSubmit = vi.fn();
    render(<PuzzleBoard position={position} onSubmit={onSubmit} disabled />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("PuzzleBoard (connect4)", () => {
  const position: PuzzlePosition = {
    kind: "connect4",
    view: { board: connect4Board({}), nextPlayer: 0, winningEntry: null },
  };

  it("submits the clicked column", async () => {
    const onSubmit = vi.fn();
    render(<PuzzleBoard position={position} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByTestId("c4-col-3"));

    expect(onSubmit).toHaveBeenCalledWith(3);
  });

  it("hides the drop arrows while disabled", () => {
    const onSubmit = vi.fn();
    render(<PuzzleBoard position={position} onSubmit={onSubmit} disabled />);

    expect(screen.queryByTestId("c4-col-3")).not.toBeInTheDocument();
  });
});

describe("PuzzleBoard (checkers)", () => {
  const position: PuzzlePosition = {
    kind: "checkers",
    view: {
      board: checkersBoard({ "4,5": "R" }),
      nextPlayer: 0,
      winner: null,
      legalMoves: [
        {
          squares: [
            [4, 5],
            [2, 3],
          ],
        },
      ],
    },
  };

  it("submits the move after clicking a piece then its destination", async () => {
    const onSubmit = vi.fn();
    render(<PuzzleBoard position={position} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByTestId("checkers-sq-4-5"));
    await userEvent.click(screen.getByTestId("checkers-sq-2-3"));

    expect(onSubmit).toHaveBeenCalledWith({
      squares: [
        [4, 5],
        [2, 3],
      ],
    });
  });

  it("ignores clicks while disabled", async () => {
    const onSubmit = vi.fn();
    render(<PuzzleBoard position={position} onSubmit={onSubmit} disabled />);

    await userEvent.click(screen.getByTestId("checkers-sq-4-5"));
    await userEvent.click(screen.getByTestId("checkers-sq-2-3"));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
