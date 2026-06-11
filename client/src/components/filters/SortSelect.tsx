import "./SortSelect.css";
import { useId, type ChangeEvent, type JSX } from "react";

export interface SortOption<T extends string> {
  value: T;
  label: string;
}

interface SortSelectProps<T extends string> {
  value: T;
  options: readonly SortOption<T>[];
  onChange: (next: T) => void;
  label?: string;
  testId?: string;
}

/** Standardized labelled <select> for "Sort" controls. */
export default function SortSelect<T extends string>({
  value,
  options,
  onChange,
  label = "Sort",
  testId = "filter-sort",
}: SortSelectProps<T>): JSX.Element {
  const id = useId();
  return (
    <div className="ga-filter-control">
      <label htmlFor={id} className="ga-filter-control__label">
        {label}
      </label>
      <select
        id={id}
        className="ga-sort-select"
        value={value}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value as T)}
        data-testid={testId}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
