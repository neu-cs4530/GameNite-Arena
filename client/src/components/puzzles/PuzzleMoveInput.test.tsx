import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CheckersBoard, CheckersEntry, Connect4Board, Connect4Entry } from "@gamenite/shared";
import type { PuzzlePosition } from "../../services/puzzleMapper.ts";
import PuzzleMoveInput from "./PuzzleMoveInput.tsx";

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

describe("PuzzleMoveInput (nim)", () => {
  const position: PuzzlePosition = { kind: "nim", view: { remaining: 2, nextPlayer: 0 } };

  it("submits the clicked take", async () => {
    const onSubmit = vi.fn();
    render(<PuzzleMoveInput position={position} disabled={false} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByTestId("puzzle-take-1"));

    expect(onSubmit).toHaveBeenCalledWith(1);
  });

  it("disables takes larger than what's remaining", () => {
    render(<PuzzleMoveInput position={position} disabled={false} onSubmit={vi.fn()} />);

    expect(screen.getByTestId("puzzle-take-1")).toBeEnabled();
    expect(screen.getByTestId("puzzle-take-2")).toBeEnabled();
    expect(screen.getByTestId("puzzle-take-3")).toBeDisabled();
  });

  it("disables every take while an attempt is in flight", () => {
    render(<PuzzleMoveInput position={position} disabled onSubmit={vi.fn()} />);

    expect(screen.getByTestId("puzzle-take-1")).toBeDisabled();
    expect(screen.getByTestId("puzzle-take-2")).toBeDisabled();
  });
});

describe("PuzzleMoveInput (guess)", () => {
  const position: PuzzlePosition = { kind: "guess", view: { finished: false, guesses: [] } };

  it("submits a valid guess", async () => {
    const onSubmit = vi.fn();
    render(<PuzzleMoveInput position={position} disabled={false} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByTestId("puzzle-guess-input"), "42");
    await userEvent.click(screen.getByTestId("puzzle-guess-submit"));

    expect(onSubmit).toHaveBeenCalledWith(42);
  });

  it("disables submit until the guess is in range", async () => {
    render(<PuzzleMoveInput position={position} disabled={false} onSubmit={vi.fn()} />);

    expect(screen.getByTestId("puzzle-guess-submit")).toBeDisabled();

    await userEvent.type(screen.getByTestId("puzzle-guess-input"), "0");
    expect(screen.getByTestId("puzzle-guess-submit")).toBeDisabled();

    await userEvent.clear(screen.getByTestId("puzzle-guess-input"));
    await userEvent.type(screen.getByTestId("puzzle-guess-input"), "50");
    expect(screen.getByTestId("puzzle-guess-submit")).toBeEnabled();
  });
});

describe("PuzzleMoveInput (board-click games)", () => {
  it("renders nothing for tictactoe, connect4, and checkers - the board itself is the input", () => {
    const positions: PuzzlePosition[] = [
      {
        kind: "tictactoe",
        view: {
          board: [
            [".", ".", "."],
            [".", ".", "."],
            [".", ".", "."],
          ],
          nextPlayer: 1,
          winningEntry: null,
        },
      },
      {
        kind: "connect4",
        view: { board: connect4Board({}), nextPlayer: 0, winningEntry: null },
      },
      {
        kind: "checkers",
        view: { board: checkersBoard({}), nextPlayer: 0, winner: null, legalMoves: [] },
      },
    ];

    for (const position of positions) {
      const { container } = render(
        <PuzzleMoveInput position={position} disabled={false} onSubmit={vi.fn()} />,
      );
      expect(container).toBeEmptyDOMElement();
    }
  });
});
