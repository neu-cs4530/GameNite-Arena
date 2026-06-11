import "./MultiToggle.css";
import type { JSX } from "react";

export interface MultiToggleOption<T extends string> {
  value: T;
  label: string;
}

interface MultiToggleProps<T extends string> {
  value: T[];
  options: readonly MultiToggleOption<T>[];
  onChange: (next: T[]) => void;
  label: string;
  /** When set, behaves as single-select (radio). */
  singleSelect?: boolean;
  testId?: string;
}

/**
 * Segmented pill control. Supports multi-select (default) and single-select
 * (`singleSelect`). Each option renders as a button with its label.
 */
export default function MultiToggle<T extends string>({
  value,
  options,
  onChange,
  label,
  singleSelect,
  testId,
}: MultiToggleProps<T>): JSX.Element {
  function toggle(opt: T) {
    if (singleSelect) {
      onChange([opt]);
      return;
    }
    const present = value.includes(opt);
    onChange(present ? value.filter((v) => v !== opt) : [...value, opt]);
  }
  return (
    <div className="ga-filter-control">
      <span className="ga-filter-control__label">{label}</span>
      <div
        className="ga-multi-toggle"
        role={singleSelect ? "radiogroup" : "group"}
        aria-label={label}
        data-testid={testId}
      >
        {options.map((o) => {
          const active = value.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              role={singleSelect ? "radio" : undefined}
              aria-checked={active}
              aria-pressed={!singleSelect ? active : undefined}
              className={`ga-multi-toggle__pill ${active ? "ga-multi-toggle__pill--active" : ""}`}
              onClick={() => toggle(o.value)}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
