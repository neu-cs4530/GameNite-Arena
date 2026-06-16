import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ProfileBestAi } from "@gamenite/shared";
import BestAiCard from "./BestAiCard.tsx";

function renderCard(bestAi: ProfileBestAi | null) {
  render(
    <MemoryRouter>
      <BestAiCard bestAi={bestAi} />
    </MemoryRouter>,
  );
}

const bestAi: ProfileBestAi = {
  modelId: "m1",
  displayName: "RookieBot",
  gameKey: "nim",
  rating: 1612.4,
  wins: 8,
  losses: 2,
  gamesPlayed: 10,
};

describe("BestAiCard", () => {
  it("renders an empty state when the user has no rated AI", () => {
    renderCard(null);
    expect(screen.getByText(/no rated ai yet/i)).toBeInTheDocument();
  });

  it("links to the model card and shows the W/L record", () => {
    renderCard(bestAi);
    expect(screen.getByRole("link", { name: "RookieBot" })).toHaveAttribute("href", "/models/m1");
    expect(screen.getByText("8W")).toBeInTheDocument();
    expect(screen.getByText("2L")).toBeInTheDocument();
  });

  it("shows the game label and tier with the rounded rating", () => {
    renderCard(bestAi);
    expect(screen.getByText("Nim")).toBeInTheDocument();
    // 1612.4 rounds to 1612, which is a Gold tier rating.
    expect(screen.getByTestId("tier-badge-gold")).toHaveTextContent("1612");
  });

  it("falls back to the raw game key when it has no display name", () => {
    // A game key with no entry in replayGameNames is shown verbatim.
    renderCard({ ...bestAi, gameKey: "mystery" });
    expect(screen.getByText("mystery")).toBeInTheDocument();
  });
});
