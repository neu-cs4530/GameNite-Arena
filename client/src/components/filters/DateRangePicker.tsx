import "./DateRangePicker.css";
import { useId, type JSX } from "react";
import type { DateRangePreset } from "../../util/types.ts";

interface DateRangePickerProps {
  value: DateRangePreset;
  dateFrom?: string;
  dateTo?: string;
  onChange: (preset: DateRangePreset, from?: string, to?: string) => void;
  testId?: string;
}

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom" },
];

export default function DateRangePicker({
  value,
  dateFrom,
  dateTo,
  onChange,
  testId = "filter-date-range",
}: DateRangePickerProps): JSX.Element {
  const id = useId();
  return (
    <div className="ga-filter-control">
      <span className="ga-filter-control__label" id={`${id}-label`}>
        Date range
      </span>
      <div
        className="ga-date-range"
        role="group"
        aria-labelledby={`${id}-label`}
        data-testid={testId}
      >
        <div className="ga-date-range__presets">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={
                "ga-date-range__preset " +
                (value === p.value ? "ga-date-range__preset--active" : "")
              }
              onClick={() => onChange(p.value, dateFrom, dateTo)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {value === "custom" && (
          <div className="ga-date-range__custom">
            <label className="ga-date-range__label">
              From
              <input
                type="date"
                value={dateFrom ?? ""}
                onChange={(e) => onChange(value, e.target.value || undefined, dateTo)}
                className="ga-date-range__input"
              />
            </label>
            <label className="ga-date-range__label">
              To
              <input
                type="date"
                value={dateTo ?? ""}
                onChange={(e) => onChange(value, dateFrom, e.target.value || undefined)}
                className="ga-date-range__input"
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
