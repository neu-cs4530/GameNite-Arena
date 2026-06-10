import "./SearchInput.css";
import { useEffect, useId, useState, type JSX } from "react";

interface SearchInputProps {
  value: string;
  onChange: (next: string) => void;
  label: string;
  placeholder?: string;
  debounceMs?: number;
  testId?: string;
}

/** Debounced search input. The committed value propagates to the parent
 * after `debounceMs` of inactivity, but the input renders the live value so
 * keystrokes feel snappy.
 */
export default function SearchInput({
  value,
  onChange,
  label,
  placeholder,
  debounceMs = 250,
  testId,
}: SearchInputProps): JSX.Element {
  const id = useId();
  const [local, setLocal] = useState(value);
  const [lastSyncValue, setLastSyncValue] = useState(value);

  // Keep local synced when the parent resets (e.g., Clear all). Derived
  // during render so we never call `setState` synchronously inside an effect.
  if (lastSyncValue !== value) {
    setLastSyncValue(value);
    setLocal(value);
  }

  // Debounce commits to parent.
  useEffect(() => {
    if (local === value) return;
    const t = setTimeout(() => onChange(local), debounceMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local, debounceMs]);

  return (
    <div className="ga-filter-control">
      <label htmlFor={id} className="ga-filter-control__label">
        {label}
      </label>
      <input
        id={id}
        type="text"
        className="ga-search-input"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        data-testid={testId}
      />
    </div>
  );
}
