import "./HyperparamInput.css";
import { useId, useState, type JSX, type ChangeEvent } from "react";

interface HyperparamInputProps {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  hint?: string;
  /** When true, use scientific-notation parsing (allows 3e-4 / 1.5e-3). */
  scientific?: boolean;
  testId?: string;
}

/** Number input with validation and an optional scientific-notation parser. */
export default function HyperparamInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  hint,
  scientific,
  testId,
}: HyperparamInputProps): JSX.Element {
  const id = useId();
  const [raw, setRaw] = useState<string>(scientific ? String(value) : String(value));
  const [error, setError] = useState<string | null>(null);

  function commit(input: string) {
    const parsed = scientific ? Number(input) : Number(input);
    if (Number.isNaN(parsed)) {
      setError("Must be a number");
      return;
    }
    if (min !== undefined && parsed < min) {
      setError(`Must be ≥ ${min}`);
      return;
    }
    if (max !== undefined && parsed > max) {
      setError(`Must be ≤ ${max}`);
      return;
    }
    setError(null);
    onChange(parsed);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    setRaw(e.target.value);
    commit(e.target.value);
  }

  return (
    <div className="ga-hpi" data-testid={testId}>
      <label htmlFor={id} className="ga-hpi__label">
        {label}
      </label>
      <div className="ga-hpi__row">
        <input
          id={id}
          type={scientific ? "text" : "number"}
          inputMode={scientific ? "text" : "decimal"}
          value={raw}
          onChange={handleChange}
          min={min}
          max={max}
          step={step}
          className={`ga-hpi__input ${error ? "ga-hpi__input--error" : ""}`.trim()}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-hint ${id}-err`}
          data-testid={testId ? `${testId}-input` : undefined}
        />
        {unit && <span className="ga-hpi__unit">{unit}</span>}
      </div>
      {hint && (
        <span id={`${id}-hint`} className="ga-hpi__hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-err`} className="ga-hpi__error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
