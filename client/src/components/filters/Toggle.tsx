import "./Toggle.css";
import { useId, type JSX } from "react";

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  testId?: string;
}

/** A labelled checkbox styled as a switch. */
export default function Toggle({ label, checked, onChange, testId }: ToggleProps): JSX.Element {
  const id = useId();
  return (
    <div className="ga-filter-control">
      <label className="ga-toggle" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          className="ga-toggle__input"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          data-testid={testId}
          aria-label={label}
        />
        <span className="ga-toggle__switch" aria-hidden="true" />
        <span className="ga-toggle__label">{label}</span>
      </label>
    </div>
  );
}
