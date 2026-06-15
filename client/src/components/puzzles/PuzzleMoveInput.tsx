import "./PuzzleMoveInput.css";
import { useState, type JSX } from "react";
import type { GuessView, NimView } from "@gamenite/shared";
import type { PuzzlePosition } from "../../services/puzzleMapper.ts";
import Button from "../ui/Button.tsx";

interface MoveInputProps {
  position: PuzzlePosition;
  /** True while an attempt is in flight — every control locks. */
  disabled: boolean;
  onSubmit: (move: unknown) => void;
}

/** Nim: one button per legal take, mirroring the live NimGame controls. */
function NimMoveInput({
  view,
  disabled,
  onSubmit,
}: {
  view: NimView;
  disabled: boolean;
  onSubmit: (move: unknown) => void;
}): JSX.Element {
  return (
    <div className="ga-puzzle-input" role="group" aria-label="Choose how many tokens to take">
      {[1, 2, 3].map((take) => (
        <Button
          key={take}
          variant="secondary"
          disabled={disabled || take > view.remaining}
          onClick={() => onSubmit(take)}
          data-testid={`puzzle-take-${take}`}
        >
          Take {take}
        </Button>
      ))}
    </div>
  );
}

/** Guess: a bounded number field + submit. */
function GuessMoveInput({
  disabled,
  onSubmit,
}: {
  view: GuessView;
  disabled: boolean;
  onSubmit: (move: unknown) => void;
}): JSX.Element {
  const [raw, setRaw] = useState("");
  const guess = Number(raw);
  const valid = raw !== "" && Number.isInteger(guess) && guess >= 1 && guess <= 100;
  return (
    <form
      className="ga-puzzle-input"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(guess);
      }}
    >
      <input
        className="ga-puzzle-input__number"
        type="number"
        min={1}
        max={100}
        step={1}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        disabled={disabled}
        aria-label="Your guess (1 to 100)"
        placeholder="1–100"
        data-testid="puzzle-guess-input"
      />
      <Button type="submit" disabled={disabled || !valid} data-testid="puzzle-guess-submit">
        Lock in guess
      </Button>
    </form>
  );
}

/**
 * gameKey → attempt-input dispatch, keyed by the same discriminant as the
 * boards: a new game gets exactly one board entry + one input entry.
 */
const inputs: {
  [key in PuzzlePosition["kind"]]: (props: MoveInputProps) => JSX.Element | null;
} = {
  nim: ({ position, ...rest }) =>
    position.kind === "nim" ? <NimMoveInput view={position.view} {...rest} /> : null,
  guess: ({ position, ...rest }) =>
    position.kind === "guess" ? <GuessMoveInput view={position.view} {...rest} /> : null,
  // these games are played by clicking the board itself (see PuzzleBoard)
  tictactoe: () => null,
  connect4: () => null,
  checkers: () => null,
};

/** Renders the per-game attempt controls for a daily puzzle. */
export default function PuzzleMoveInput(props: MoveInputProps): JSX.Element {
  return <>{inputs[props.position.kind](props)}</>;
}
