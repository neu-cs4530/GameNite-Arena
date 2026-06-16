import "./RangeSlider.css";
import { useId, type ChangeEvent, type JSX } from "react";

interface RangeSliderProps {
  label: string;
  min: number;
  max: number;
  value: [number, number];
  /**
   * Commit one handle's value. Each handle reports ONLY its own change —
   * never the pair. Committing the pair is unsafe: a re-render with
   * not-yet-updated router state can reset the sibling's controlled value
   * to its default between two quick commits, and re-emitting that stale
   * default would erase the sibling's URL param (defaults are stripped
   * from the URL).
   */
  onCommitLo: (lo: number) => void;
  onCommitHi: (hi: number) => void;
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
  onCommitLo,
  onCommitHi,
  step = 1,
  format = (n) => `${n}`,
  testId: testIdBase = "range",
  containerTestId,
}: RangeSliderProps): JSX.Element {
  const id = useId();
  const [lo, hi] = value;

  // The sibling handle's live DOM value, used only to clamp the dragged
  // handle so the two can't cross. Read from the DOM rather than the render
  // closure because the closure can lag the user's last gesture.
  function siblingValue(e: ChangeEvent<HTMLInputElement>, selector: string, fallback: number) {
    const el = e.currentTarget.closest(".ga-range")?.querySelector<HTMLInputElement>(selector);
    // Defensive: the sibling handle is always rendered, so `el` is never null
    // and its value is never NaN in practice.
    /* v8 ignore start */
    const v = el ? Number(el.value) : NaN;
    return Number.isNaN(v) ? fallback : v;
    /* v8 ignore stop */
  }

  function setLo(e: ChangeEvent<HTMLInputElement>) {
    const v = Number(e.target.value);
    const hiNow = siblingValue(e, ".ga-range__input--hi", hi);
    onCommitLo(Math.min(v, hiNow));
  }
  function setHi(e: ChangeEvent<HTMLInputElement>) {
    const v = Number(e.target.value);
    const loNow = siblingValue(e, ".ga-range__input--lo", lo);
    onCommitHi(Math.max(v, loNow));
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
