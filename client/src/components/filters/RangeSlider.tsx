import "./RangeSlider.css";
import { useId, type ChangeEvent, type JSX } from "react";

interface RangeSliderProps {
  label: string;
  min: number;
  max: number;
  value: [number, number];
  onChange: (next: [number, number]) => void;
  step?: number;
  /** Custom value formatter, e.g. (n) => `Elo ${n}`. */
  format?: (n: number) => string;
  /**
   * Test-id prefix for the dual handles. Wrapper element is exposed as
   * `${prefix}-range` (e.g. `filter-elo-range`), and the handles as
   * `${prefix}-min` / `${prefix}-max`.
   */
  testId?: string;
  /** Optional override for the wrapper's data-testid. */
  containerTestId?: string;
}

/**
 * Dual-handle range slider implemented with two overlaid `<input type="range">`.
 * Keeps both handles fully accessible (keyboard arrows, focus rings).
 */
export default function RangeSlider({
  label,
  min,
  max,
  value,
  onChange,
  step = 1,
  format = (n) => `${n}`,
  testId: testIdBase = "range",
  containerTestId,
}: RangeSliderProps): JSX.Element {
  const id = useId();
  const [lo, hi] = value;

  function setLo(e: ChangeEvent<HTMLInputElement>) {
    const v = Number(e.target.value);
    onChange([Math.min(v, hi), hi]);
  }
  function setHi(e: ChangeEvent<HTMLInputElement>) {
    const v = Number(e.target.value);
    onChange([lo, Math.max(v, lo)]);
  }

  const fillStart = ((lo - min) / (max - min)) * 100;
  const fillEnd = ((hi - min) / (max - min)) * 100;

  return (
    <div className="ga-filter-control" data-testid={containerTestId ?? `${testIdBase}-range`}>
      <span className="ga-filter-control__label" id={`${id}-label`}>
        {label}
        <span className="ga-range__value">
          {" "}
          {format(lo)}
          {" – "}
          {format(hi)}
        </span>
      </span>
      <div className="ga-range" role="group" aria-labelledby={`${id}-label`}>
        <div className="ga-range__track" aria-hidden="true">
          <div
            className="ga-range__fill"
            style={{ left: `${fillStart}%`, right: `${100 - fillEnd}%` }}
          />
        </div>
        <input
          type="range"
          className="ga-range__input ga-range__input--lo"
          min={min}
          max={max}
          step={step}
          value={lo}
          onChange={setLo}
          aria-label={`${label} minimum`}
          data-testid={`${testIdBase}-min`}
        />
        <input
          type="range"
          className="ga-range__input ga-range__input--hi"
          min={min}
          max={max}
          step={step}
          value={hi}
          onChange={setHi}
          aria-label={`${label} maximum`}
          data-testid={`${testIdBase}-max`}
        />
      </div>
    </div>
  );
}
