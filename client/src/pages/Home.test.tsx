import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Home from "./Home.tsx";

function renderHome(): void {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/games" element={<div data-testid="games-page" />} />
        <Route path="/puzzles" element={<div data-testid="puzzles-hub-page" />} />
        <Route path="/watch" element={<div data-testid="watch-hub-page" />} />
        <Route path="/leaderboards" element={<div data-testid="leaderboards-page" />} />
        <Route path="/forum" element={<div data-testid="forum-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Home", () => {
  it("renders a tile for every destination", () => {
    renderHome();
    expect(screen.getByTestId("home-tile-matchmaking")).toBeInTheDocument();
    expect(screen.getByTestId("home-tile-puzzles")).toBeInTheDocument();
    expect(screen.getByTestId("home-tile-watch")).toBeInTheDocument();
    expect(screen.getByTestId("home-tile-leaderboards")).toBeInTheDocument();
    expect(screen.getByTestId("home-tile-forum")).toBeInTheDocument();
  });

  it("navigates to /games when the Matchmaking tile is clicked", async () => {
    renderHome();
    await userEvent.click(screen.getByTestId("home-tile-matchmaking"));
    expect(screen.getByTestId("games-page")).toBeInTheDocument();
  });

  it("navigates to /puzzles when the Puzzles tile is clicked", async () => {
    renderHome();
    await userEvent.click(screen.getByTestId("home-tile-puzzles"));
    expect(screen.getByTestId("puzzles-hub-page")).toBeInTheDocument();
  });

  it("navigates to /watch when the Watch Games tile is clicked", async () => {
    renderHome();
    await userEvent.click(screen.getByTestId("home-tile-watch"));
    expect(screen.getByTestId("watch-hub-page")).toBeInTheDocument();
  });

  it("navigates to /leaderboards and /forum from their tiles", async () => {
    renderHome();
    await userEvent.click(screen.getByTestId("home-tile-leaderboards"));
    expect(screen.getByTestId("leaderboards-page")).toBeInTheDocument();
  });
});
