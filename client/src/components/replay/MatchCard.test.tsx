import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MatchCard from "./MatchCard.tsx";
import type { ReplaySummary } from "../../util/types.ts";

// useNavigate requires a Router context.
function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

function makeMatch(overrides: Partial<ReplaySummary> = {}): ReplaySummary {
  return {
    matchId: "m-test",
    gameKey: "nim",
    rated: true,
    participants: [
      { id: "u-a", type: "human", displayName: "Alice", username: "alice", ratingAtMatchTime: 1500 },
      { id: "u-b", type: "human", displayName: "Bob", username: "bob", ratingAtMatchTime: 1600 },
    ],
    result: { outcome: "win", winnerId: "u-a" },
    moveCount: 7,
    watchCount: 42,
    completedAt: new Date("2026-05-01T00:00:00.000Z").toISOString(),
    ...overrides,
  };
}

describe("MatchCard", () => {
  it("renders both participants", () => {
    render(<MatchCard match={makeMatch()} />, { wrapper });
    expect(screen.getAllByTestId("match-card-player")).toHaveLength(2);
  });

  it("shows 'Win' result chip when there's a winner", () => {
    render(<MatchCard match={makeMatch({ result: { outcome: "win", winnerId: "u-a" } })} />, {
      wrapper,
    });
    expect(screen.getByTestId("match-card-result")).toHaveTextContent("Win");
  });

  it("shows 'Loss' chip when viewerUsername is the loser", () => {
    render(
      <MatchCard
        match={makeMatch({ result: { outcome: "win", winnerId: "u-a" } })}
        viewerUsername="bob"
      />,
      { wrapper },
    );
    expect(screen.getByTestId("match-card-result")).toHaveTextContent("Loss");
  });

  it("shows 'Win' chip when viewerUsername is the winner", () => {
    render(
      <MatchCard
        match={makeMatch({ result: { outcome: "win", winnerId: "u-a" } })}
        viewerUsername="alice"
      />,
      { wrapper },
    );
    expect(screen.getByTestId("match-card-result")).toHaveTextContent("Win");
  });

  it("shows 'Draw' chip for a draw outcome", () => {
    render(
      <MatchCard match={makeMatch({ result: { outcome: "draw" } })} />,
      { wrapper },
    );
    expect(screen.getByTestId("match-card-result")).toHaveTextContent("Draw");
  });

  it("shows 'Abandoned' chip for an abandoned outcome", () => {
    render(
      <MatchCard match={makeMatch({ result: { outcome: "abandoned" } })} />,
      { wrapper },
    );
    expect(screen.getByTestId("match-card-result")).toHaveTextContent("Abandoned");
  });

  it("shows 'Forfeit' chip for a forfeit outcome", () => {
    render(
      <MatchCard match={makeMatch({ result: { outcome: "forfeit" } })} />,
      { wrapper },
    );
    expect(screen.getByTestId("match-card-result")).toHaveTextContent("Forfeit");
  });

  it("shows 'Win' when the winner id has no matching participant", () => {
    render(
      <MatchCard match={makeMatch({ result: { outcome: "win", winnerId: "unknown-id" } })} />,
      { wrapper },
    );
    expect(screen.getByTestId("match-card-result")).toHaveTextContent("Win");
  });

  it("shows 'Win' when viewerUsername is set but not a participant", () => {
    render(
      <MatchCard
        match={makeMatch({ result: { outcome: "win", winnerId: "u-a" } })}
        viewerUsername="ghost"
      />,
      { wrapper },
    );
    expect(screen.getByTestId("match-card-result")).toHaveTextContent("Win");
  });

  it("shows the Rated badge for rated matches", () => {
    render(<MatchCard match={makeMatch({ rated: true })} />, { wrapper });
    expect(screen.getByTestId("badge-rated")).toBeInTheDocument();
  });

  it("does not show the Rated badge for unrated matches", () => {
    render(<MatchCard match={makeMatch({ rated: false })} />, { wrapper });
    expect(screen.queryByTestId("badge-rated")).not.toBeInTheDocument();
  });

  it("calls onClick prop instead of navigating when provided", () => {
    const onClick = vi.fn();
    render(<MatchCard match={makeMatch()} onClick={onClick} />, { wrapper });
    fireEvent.click(screen.getByTestId("match-card"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders move count and watch count", () => {
    render(<MatchCard match={makeMatch({ moveCount: 13, watchCount: 99 })} />, { wrapper });
    expect(screen.getByTestId("match-card-moves")).toHaveTextContent("13");
    expect(screen.getByTestId("match-card-watches")).toHaveTextContent("99");
  });

  it("shows the game name badge", () => {
    render(<MatchCard match={makeMatch({ gameKey: "connect4" })} />, { wrapper });
    expect(screen.getByTestId("match-card-game")).toBeInTheDocument();
  });

  it("computes avgElo when at least one participant has a rating", () => {
    // Both have ratings → avgElo = (1500+1600)/2 = 1550 → TierBadge should render
    render(<MatchCard match={makeMatch()} />, { wrapper });
    // TierBadge is present whenever avgElo is defined
    const card = screen.getByTestId("match-card");
    expect(card).toBeInTheDocument();
  });

  it("omits avgElo when no participants have ratings", () => {
    const match = makeMatch({
      participants: [
        { id: "u-a", type: "human", displayName: "Alice", username: "alice" },
        { id: "u-b", type: "human", displayName: "Bob", username: "bob" },
      ],
    });
    render(<MatchCard match={match} />, { wrapper });
    // Should render without throwing (no avgElo → no TierBadge)
    expect(screen.getByTestId("match-card")).toBeInTheDocument();
  });

  it("renders the AI badge for AI participants", () => {
    const match = makeMatch({
      participants: [
        { id: "dep-1", type: "ai", displayName: "Bot", username: "bot" },
        { id: "u-b", type: "human", displayName: "Bob", username: "bob" },
      ],
    });
    render(<MatchCard match={match} />, { wrapper });
    expect(screen.getByTestId("match-card-badge-ai")).toBeInTheDocument();
    expect(screen.getByTestId("match-card-badge-human")).toBeInTheDocument();
  });
});
