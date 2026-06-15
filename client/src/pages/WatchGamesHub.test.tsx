import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import WatchGamesHub from "./WatchGamesHub.tsx";

function renderHub(): void {
  render(
    <MemoryRouter initialEntries={["/watch"]}>
      <Routes>
        <Route path="/watch" element={<WatchGamesHub />} />
        <Route path="/replays" element={<div data-testid="replays-page" />} />
        <Route path="/live" element={<div data-testid="live-page" />} />
        <Route path="/highlights" element={<div data-testid="highlights-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("WatchGamesHub", () => {
  it("renders a tile for Replays, Live Games, and Highlights", () => {
    renderHub();
    expect(screen.getByTestId("watch-hub-tile-replays")).toBeInTheDocument();
    expect(screen.getByTestId("watch-hub-tile-live")).toBeInTheDocument();
    expect(screen.getByTestId("watch-hub-tile-highlights")).toBeInTheDocument();
  });

  it("navigates to /replays when the Replays tile is clicked", async () => {
    renderHub();
    await userEvent.click(screen.getByTestId("watch-hub-tile-replays"));
    expect(screen.getByTestId("replays-page")).toBeInTheDocument();
  });

  it("navigates to /live when the Live Games tile is clicked", async () => {
    renderHub();
    await userEvent.click(screen.getByTestId("watch-hub-tile-live"));
    expect(screen.getByTestId("live-page")).toBeInTheDocument();
  });

  it("navigates to /highlights when the Highlights tile is clicked", async () => {
    renderHub();
    await userEvent.click(screen.getByTestId("watch-hub-tile-highlights"));
    expect(screen.getByTestId("highlights-page")).toBeInTheDocument();
  });
});
