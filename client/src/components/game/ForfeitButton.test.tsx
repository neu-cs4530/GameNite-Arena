import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SafeUserInfo } from "@gamenite/shared";
import ForfeitButton from "./ForfeitButton.tsx";
import { LoginContext } from "../../contexts/LoginContext.ts";
import type { GameSocket } from "../../util/types.ts";

const viewer: SafeUserInfo = { username: "alice", display: "Alice", createdAt: new Date(0) };

function renderForfeit(): ReturnType<typeof vi.fn> {
  const emit = vi.fn();
  const socket = { emit } as unknown as GameSocket;
  render(
    <LoginContext.Provider value={{ user: viewer, pass: "pw", reset: () => {}, socket }}>
      <ForfeitButton gameId="game-9" />
    </LoginContext.Provider>,
  );
  return emit;
}

describe("ForfeitButton", () => {
  it("requires a confirm before sending anything", async () => {
    const emit = renderForfeit();
    await userEvent.click(screen.getByTestId("forfeit"));
    expect(screen.getByTestId("forfeit-confirm")).toBeInTheDocument();
    expect(emit).not.toHaveBeenCalled();
  });

  it("emits gameForfeit with the auth envelope once confirmed", async () => {
    const emit = renderForfeit();
    await userEvent.click(screen.getByTestId("forfeit"));
    await userEvent.click(screen.getByTestId("forfeit-confirm-yes"));
    expect(emit).toHaveBeenCalledWith("gameForfeit", {
      auth: { username: "alice", password: "pw" },
      payload: "game-9",
    });
    // Back to the idle button after sending.
    expect(screen.getByTestId("forfeit")).toBeInTheDocument();
  });

  it("cancel keeps playing — nothing is sent", async () => {
    const emit = renderForfeit();
    await userEvent.click(screen.getByTestId("forfeit"));
    await userEvent.click(screen.getByTestId("forfeit-cancel"));
    expect(emit).not.toHaveBeenCalled();
    expect(screen.getByTestId("forfeit")).toBeInTheDocument();
  });
});
