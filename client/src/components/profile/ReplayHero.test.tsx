import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReplaySummary } from "@gamenite/shared";
import ReplayHero from "./ReplayHero.tsx";

function renderHero(replay: ReplaySummary | null) {
  render(
    <MemoryRouter>
      <ReplayHero replay={replay} />
    </MemoryRouter>,
  );
}

function replay(watchCount: number): ReplaySummary {
  return {
    matchId: "m1",
    gameKey: "nim",
    participants: [{ displayName: "Ada" }, { displayName: "Bob" }],
    watchCount,
    completedAt: "2026-06-01T00:00:00Z",
  } as ReplaySummary;
}

describe("ReplayHero", () => {
  it("renders an empty state when there is no replay", () => {
    renderHero(null);
    expect(screen.getByTestId("profile-hero-replay-empty")).toBeInTheDocument();
  });

  it("links to the replay and lists the players", () => {
    renderHero(replay(5));
    const link = screen.getByRole("link", { name: "Ada vs Bob" });
    expect(link).toHaveAttribute("href", "/replays/m1");
  });

  it("pluralizes the watch count", () => {
    renderHero(replay(5));
    expect(screen.getByTestId("profile-hero-watch-count")).toHaveTextContent("5 watches");
  });

  it("uses the singular for exactly one watch", () => {
    renderHero(replay(1));
    expect(screen.getByTestId("profile-hero-watch-count")).toHaveTextContent("1 watch");
  });
});
