import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import PuzzlesHub from "./PuzzlesHub.tsx";

function renderHub(): void {
  render(
    <MemoryRouter initialEntries={["/puzzles"]}>
      <Routes>
        <Route path="/puzzles" element={<PuzzlesHub />} />
        <Route path="/puzzles/daily" element={<div data-testid="daily-puzzle-page" />} />
        <Route path="/puzzles/practice" element={<div data-testid="practice-page-stub" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PuzzlesHub", () => {
  it("renders a tile for Daily Puzzle and Practice", () => {
    renderHub();
    expect(screen.getByTestId("puzzles-hub-tile-daily")).toBeInTheDocument();
    expect(screen.getByTestId("puzzles-hub-tile-practice")).toBeInTheDocument();
  });

  it("navigates to /puzzles/daily when the Daily Puzzle tile is clicked", async () => {
    renderHub();
    await userEvent.click(screen.getByTestId("puzzles-hub-tile-daily"));
    expect(screen.getByTestId("daily-puzzle-page")).toBeInTheDocument();
  });

  it("navigates to /puzzles/practice when the Practice tile is clicked", async () => {
    renderHub();
    await userEvent.click(screen.getByTestId("puzzles-hub-tile-practice"));
    expect(screen.getByTestId("practice-page-stub")).toBeInTheDocument();
  });
});
