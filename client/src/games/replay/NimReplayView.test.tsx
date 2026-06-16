import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { NimView } from "@gamenite/shared";
import type { MatchParticipantView } from "../../util/types.ts";
import NimReplayView from "./NimReplayView.tsx";

const PLAYERS = [{ displayName: "Ada" }, { displayName: "Bob" }] as MatchParticipantView[];

describe("NimReplayView", () => {
  it("prompts the next player while tokens remain", () => {
    const view: NimView = { remaining: 5, nextPlayer: 0 };
    render(<NimReplayView view={view} participants={PLAYERS} startingPile={10} />);
    expect(screen.getByText(/next to move/i)).toHaveTextContent("Ada");
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("shows a game-over message when the pile is empty", () => {
    const view: NimView = { remaining: 0, nextPlayer: 1 };
    render(<NimReplayView view={view} participants={PLAYERS} />);
    expect(screen.getByText(/game over/i)).toHaveTextContent("Bob");
  });

  it("shows an em dash when the next player is unknown", () => {
    const view: NimView = { remaining: 3, nextPlayer: 0 };
    render(<NimReplayView view={view} participants={[]} />);
    expect(screen.getByText(/next to move/i)).toHaveTextContent("—");
  });
});
