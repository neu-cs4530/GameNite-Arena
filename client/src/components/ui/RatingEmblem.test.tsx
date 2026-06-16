import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RatingEmblem from "./RatingEmblem.tsx";

vi.mock("../replay/TierBadge.tsx", () => ({
  default: ({ rating }: { rating: number }) => <span data-testid="tier-badge">{rating}</span>,
}));

describe("RatingEmblem", () => {
  it("shows provisional badge when rd > 150", () => {
    render(<RatingEmblem rating={1500} rd={200} gamesPlayed={5} />);
    expect(screen.getByText("provisional")).toBeTruthy();
  });

  it("shows provisional badge when gamesPlayed is 0", () => {
    render(<RatingEmblem rating={1500} rd={100} gamesPlayed={0} />);
    expect(screen.getByText("provisional")).toBeTruthy();
  });

  it("hides provisional badge when rd <= 150 and gamesPlayed > 0", () => {
    render(<RatingEmblem rating={1500} rd={100} gamesPlayed={10} />);
    expect(screen.queryByText("provisional")).toBeNull();
  });

  it("hides provisional badge when rd is undefined and gamesPlayed > 0", () => {
    render(<RatingEmblem rating={1500} gamesPlayed={10} />);
    expect(screen.queryByText("provisional")).toBeNull();
  });

  it("renders the rounded rating in TierBadge", () => {
    render(<RatingEmblem rating={1523.7} />);
    expect(screen.getByTestId("tier-badge").textContent).toBe("1524");
  });
});
