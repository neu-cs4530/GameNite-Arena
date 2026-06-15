import "./PuzzleBoard.css";
import type { JSX } from "react";
import type {
  CheckersView,
  Connect4View,
  GuessView,
  NimView,
  TicTacToeView,
} from "@gamenite/shared";
import type { PuzzlePosition } from "../../services/puzzleMapper.ts";
import type { MatchParticipantView } from "../../util/types.ts";
import NimReplayView from "../../games/replay/NimReplayView.tsx";
import TicTacToeReplayView from "../../games/replay/TicTacToeReplayView.tsx";
import Connect4ReplayView from "../../games/replay/Connect4ReplayView.tsx";
import CheckersReplayView from "../../games/replay/CheckersReplayView.tsx";

/** "You" for the side to move, "Opponent" for the other side. */
function puzzleParticipants(nextPlayer: number): MatchParticipantView[] {
  return [0, 1].map((index) =>
    index === nextPlayer
      ? { id: "puzzle-you", type: "human", displayName: "You" }
      : { id: "puzzle-opponent", type: "human", displayName: "Opponent" },
  );
}

/**
 * Nim daily-puzzle position. Reuses the replay board (the position IS a
 * NimView), with synthetic participants so the side to move reads as "You"
 * — the solver plays the archived winner's clinching turn.
 */
function NimPuzzleBoard({ view }: { view: NimView }): JSX.Element {
  const participants = puzzleParticipants(view.nextPlayer);
  return (
    <div className="ga-puzzle-board" data-testid="puzzle-board-nim">
      {/* The puzzle is a fresh position, not a scrubbed replay — size the
          pile to what's actually left so no ghost tokens render. */}
      <NimReplayView view={view} participants={participants} startingPile={view.remaining} />
      <p className="ga-puzzle-board__framing">
        Your move — take 1, 2 or 3 tokens. Whoever takes the last token loses.
      </p>
    </div>
  );
}

/**
 * Number Guesser daily-puzzle position: the prompt context for a mid-game
 * table. The watcher view only says WHO has guessed, never the values or
 * the secret.
 */
function GuessPuzzleBoard({ view }: { view: GuessView }): JSX.Element {
  const total = view.guesses.length;
  const locked = view.finished ? total : view.guesses.filter(Boolean).length;
  return (
    <div className="ga-puzzle-board" data-testid="puzzle-board-guess">
      <div className="ga-puzzle-board__guess-context">
        <span className="ga-puzzle-board__guess-count">
          {locked} of {total}
        </span>
        <span className="ga-puzzle-board__guess-count-label">guesses locked in</span>
      </div>
      <p className="ga-puzzle-board__framing">
        The table is hunting a secret number between 1 and 100 — closest guess wins. Recreate the
        archived line: what did the next player lock in?
      </p>
    </div>
  );
}

interface InteractiveBoardProps {
  /** Submits the clicked move. Omitted (or `disabled`) means read-only. */
  onSubmit?: (move: unknown) => void;
  disabled?: boolean;
}

/** Tic-Tac-Toe daily-puzzle position: click a square to submit your move. */
function TicTacToePuzzleBoard({
  view,
  onSubmit,
  disabled,
}: InteractiveBoardProps & { view: TicTacToeView }): JSX.Element {
  const participants = puzzleParticipants(view.nextPlayer);
  const interactive = onSubmit !== undefined && !disabled;
  return (
    <div className="ga-puzzle-board" data-testid="puzzle-board-tictactoe">
      <TicTacToeReplayView
        view={view}
        participants={participants}
        onCellClick={interactive ? (row, col) => onSubmit([row, col]) : undefined}
      />
      <p className="ga-puzzle-board__framing">Your move: click the square that forces a win.</p>
    </div>
  );
}

/** Connect 4 daily-puzzle position: click a column arrow to drop and submit. */
function Connect4PuzzleBoard({
  view,
  onSubmit,
  disabled,
}: InteractiveBoardProps & { view: Connect4View }): JSX.Element {
  const participants = puzzleParticipants(view.nextPlayer);
  const interactive = onSubmit !== undefined && !disabled;
  return (
    <div className="ga-puzzle-board" data-testid="puzzle-board-connect4">
      <Connect4ReplayView
        view={view}
        participants={participants}
        onColumnClick={interactive ? (col) => onSubmit(col) : undefined}
      />
      <p className="ga-puzzle-board__framing">Your move: drop the disc that wins on the spot.</p>
    </div>
  );
}

/** Checkers daily-puzzle position: click a piece then a square to submit. */
function CheckersPuzzleBoard({
  view,
  onSubmit,
  disabled,
}: InteractiveBoardProps & { view: CheckersView }): JSX.Element {
  const participants = puzzleParticipants(view.nextPlayer);
  const interactive = onSubmit !== undefined && !disabled;
  return (
    <div className="ga-puzzle-board" data-testid="puzzle-board-checkers">
      <CheckersReplayView
        view={view}
        participants={participants}
        onMove={interactive ? (move) => onSubmit(move) : undefined}
      />
      <p className="ga-puzzle-board__framing">
        Your move: click a piece, then a square, for the move that wins on the spot.
      </p>
    </div>
  );
}

// gameKey -> board, one entry per PuzzlePosition kind
const boards: {
  [key in PuzzlePosition["kind"]]: (
    position: PuzzlePosition,
    interactive: InteractiveBoardProps,
  ) => JSX.Element | null;
} = {
  nim: (position) => (position.kind === "nim" ? <NimPuzzleBoard view={position.view} /> : null),
  guess: (position) =>
    position.kind === "guess" ? <GuessPuzzleBoard view={position.view} /> : null,
  tictactoe: (position, interactive) =>
    position.kind === "tictactoe" ? (
      <TicTacToePuzzleBoard view={position.view} {...interactive} />
    ) : null,
  connect4: (position, interactive) =>
    position.kind === "connect4" ? (
      <Connect4PuzzleBoard view={position.view} {...interactive} />
    ) : null,
  checkers: (position, interactive) =>
    position.kind === "checkers" ? (
      <CheckersPuzzleBoard view={position.view} {...interactive} />
    ) : null,
};

interface PuzzleBoardProps extends InteractiveBoardProps {
  position: PuzzlePosition;
}

/**
 * Renders the per-game board for a daily puzzle position. For
 * tictactoe/connect4/checkers, passing `onSubmit` makes the board itself the
 * move picker (click a cell, column or piece), same as the live games.
 */
export default function PuzzleBoard({
  position,
  onSubmit,
  disabled,
}: PuzzleBoardProps): JSX.Element {
  return <>{boards[position.kind](position, { onSubmit, disabled })}</>;
}
