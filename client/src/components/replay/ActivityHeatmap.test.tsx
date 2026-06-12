import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { HeatmapGrid } from "@gamenite/shared";
import ActivityHeatmap from "./ActivityHeatmap.tsx";

function gridWith(entries: ReadonlyArray<readonly [number, number, number]>): HeatmapGrid {
  const cells = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const [day, hour, count] of entries) cells[day][hour] = count;
  return cells;
}

describe("ActivityHeatmap (pure presentational)", () => {
  it("renders 7 rows of 24 cells straight from the grid prop", () => {
    render(<ActivityHeatmap grid={gridWith([])} />);
    const rows = screen.getAllByTestId("heatmap-row");
    expect(rows).toHaveLength(7);
    for (const row of rows) {
      expect(within(row).getAllByTestId("heatmap-cell")).toHaveLength(24);
    }
  });

  it('labels cells as "<Weekday> <HH>:00, N match(es)" from the grid counts', () => {
    render(
      <ActivityHeatmap
        grid={gridWith([
          [0, 0, 5],
          [6, 23, 1],
        ])}
      />,
    );
    expect(screen.getByLabelText("Sunday 00:00, 5 matches")).toBeInTheDocument();
    expect(screen.getByLabelText("Saturday 23:00, 1 match")).toBeInTheDocument();
    expect(screen.getByLabelText("Monday 12:00, 0 matches")).toBeInTheDocument();
  });

  it("keeps the activity-heatmap card testid", () => {
    render(<ActivityHeatmap grid={gridWith([])} />);
    expect(screen.getByTestId("activity-heatmap")).toBeInTheDocument();
  });
});
