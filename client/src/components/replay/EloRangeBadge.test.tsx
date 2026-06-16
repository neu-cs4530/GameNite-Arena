import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MatchParticipantView } from "../../util/types.ts";
import EloRangeBadge from "./EloRangeBadge.tsx";

function participant(rating?: number): MatchParticipantView {
  return { displayName: "P", ratingAtMatchTime: rating } as MatchParticipantView;
}

describe("EloRangeBadge", () => {
  it("renders nothing when no participant has a rating", () => {
    const { container } = render(<EloRangeBadge participants={[participant(), participant()]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows an average for a single known rating", () => {
    render(<EloRangeBadge participants={[participant(1500), participant()]} />);
    expect(screen.getByTestId("match-card-elo-range")).toHaveTextContent("Avg 1500");
  });

  it("shows the min-max range for two known ratings", () => {
    render(<EloRangeBadge participants={[participant(1800), participant(1200)]} />);
    expect(screen.getByTestId("match-card-elo-range")).toHaveTextContent("1200-1800");
  });
});
