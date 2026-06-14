import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import PuzzleStatsPanel from "./PuzzleStatsPanel.tsx";
import {
  profileSummaryFixture,
  freshProfileSummaryFixture,
} from "../../__fixtures__/profileSummary.ts";

describe("PuzzleStatsPanel", () => {
  it("renders the overall elo and per-game tiles from the stats", () => {
    render(<PuzzleStatsPanel stats={profileSummaryFixture.puzzles} />);
    expect(screen.getByTestId("puzzle-stat-overall")).toHaveTextContent("1512");
    expect(screen.getByTestId("puzzle-stat-nim-elo")).toHaveTextContent("1512");
    expect(screen.getByTestId("puzzle-stat-nim-solve-rate")).toHaveTextContent("71%");
    expect(screen.getByTestId("puzzle-stat-nim-avg-time")).toHaveTextContent("41s");
    expect(screen.getByTestId("puzzle-stat-nim-attempts")).toHaveTextContent("14");
  });

  it("shows the effective current streak alongside the best", () => {
    render(<PuzzleStatsPanel stats={profileSummaryFixture.puzzles} />);
    const streak = screen.getByTestId("puzzle-streak");
    expect(streak).toHaveTextContent("4");
    expect(streak).toHaveTextContent(/best 9/i);
  });

  it("lists recent attempts with date/game/result/rated/eloDelta/time", () => {
    render(<PuzzleStatsPanel stats={profileSummaryFixture.puzzles} />);
    const table = screen.getByTestId("puzzle-attempts");
    const rows = within(table).getAllByTestId("puzzle-attempt-row");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("2026-06-11");
    expect(rows[0]).toHaveTextContent("Nim");
    expect(rows[0]).toHaveTextContent(/solved/i);
    expect(rows[0]).toHaveTextContent(/rated/i);
    expect(rows[0]).toHaveTextContent("+12");
    expect(rows[0]).toHaveTextContent("38s");
    expect(rows[1]).toHaveTextContent(/missed/i);
    expect(rows[1]).toHaveTextContent("-8");
    expect(rows[2]).toHaveTextContent(/casual/i);
  });

  it("renders an honest empty state for a user with no puzzle history", () => {
    render(<PuzzleStatsPanel stats={freshProfileSummaryFixture.puzzles} />);
    expect(screen.getByText(/no puzzles attempted yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId("puzzle-attempts")).not.toBeInTheDocument();
  });
});
