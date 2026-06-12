import "./ActivityHeatmap.css";
import type { JSX } from "react";
import { useMemo } from "react";
import type { HeatmapGrid } from "@gamenite/shared";
import Card from "../ui/Card.tsx";

interface ActivityHeatmapProps {
  /** 7 rows (Sunday..Saturday) x 24 columns (UTC hour) of match counts. */
  grid: HeatmapGrid;
  /** Optional override for the subheading (e.g. the scoped game's name). */
  subtitle?: string;
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * 7x24 grid showing match counts across (weekday, hour). PURE presentational:
 * the bucket counts arrive fully computed (server-aggregated real data via
 * `ProfileSummary`); each cell renders as a coloured square whose intensity
 * is proportional to the count at that weekday/hour.
 */
export default function ActivityHeatmap({ grid, subtitle }: ActivityHeatmapProps): JSX.Element {
  const max = useMemo(() => grid.reduce((m, row) => Math.max(m, ...row), 0), [grid]);

  return (
    <Card className="ga-heatmap" testId="activity-heatmap">
      <header className="ga-heatmap__head">
        <h3>Activity heatmap</h3>
        <span className="ga-heatmap__sub">{subtitle ?? "Matches per weekday / hour (UTC)"}</span>
      </header>
      <div className="ga-heatmap__grid" role="grid" aria-label="Match activity by weekday and hour">
        {grid.map((row, day) => (
          <div className="ga-heatmap__row" data-testid="heatmap-row" key={day} role="row">
            <span className="ga-heatmap__rowlabel">{WEEKDAY_NAMES[day].slice(0, 3)}</span>
            {row.map((count, hour) => {
              const intensity = max === 0 ? 0 : count / max;
              const hourLabel = `${String(hour).padStart(2, "0")}:00`;
              return (
                <span
                  key={hour}
                  className="ga-heatmap__cell"
                  data-testid="heatmap-cell"
                  data-day={day}
                  data-hour={hour}
                  role="gridcell"
                  aria-label={`${WEEKDAY_NAMES[day]} ${hourLabel}, ${count} ${count === 1 ? "match" : "matches"}`}
                  style={{ ["--ga-cell-intensity" as string]: String(intensity) }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
}
