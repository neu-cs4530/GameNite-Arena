import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReplaySummary } from "../../util/types.ts";
import MatchGrid from "./MatchGrid.tsx";

// Stub the children so this test focuses on MatchGrid's own branching
// (skeletons vs cards) without pulling in MatchCard's routing/avatars.
vi.mock("./MatchCard.tsx", () => ({
  default: ({ match }: { match: ReplaySummary }) => <div data-testid="card">{match.matchId}</div>,
}));
vi.mock("./MatchCardSkeleton.tsx", () => ({
  default: () => <div data-testid="skeleton" />,
}));

const REPLAYS = [{ matchId: "m1" }, { matchId: "m2" }] as ReplaySummary[];

describe("MatchGrid", () => {
  it("shows only skeletons while loading with no data", () => {
    render(<MatchGrid replays={[]} loading skeletonCount={3} />);
    expect(screen.getAllByTestId("skeleton")).toHaveLength(3);
    expect(screen.queryByTestId("card")).not.toBeInTheDocument();
  });

  it("renders one card per replay when not loading", () => {
    render(<MatchGrid replays={REPLAYS} />);
    expect(screen.getAllByTestId("card")).toHaveLength(2);
    expect(screen.queryByTestId("skeleton")).not.toBeInTheDocument();
  });

  it("keeps the cards and adds a single inline skeleton while loading more", () => {
    render(<MatchGrid replays={REPLAYS} loading />);
    expect(screen.getAllByTestId("card")).toHaveLength(2);
    expect(screen.getAllByTestId("skeleton")).toHaveLength(1);
  });
});
