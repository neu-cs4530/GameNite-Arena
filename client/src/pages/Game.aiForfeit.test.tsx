import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { GameInfo, SafeUserInfo } from "@gamenite/shared";
import Game from "./Game.tsx";
import { LoginContext } from "../contexts/LoginContext.ts";
import type { GameSocket } from "../util/types.ts";
import { getGameById } from "../services/gameService.ts";
import { queueSessionKey, serializeQueueSession } from "../util/requeuePolicy.ts";

// Heavy children — stub them; this test is about the toolbar gate in Game.tsx.
vi.mock("../components/GamePanel.tsx", () => ({
  default: () => <div data-testid="game-panel-stub" />,
}));
vi.mock("../components/ChatPanel.tsx", () => ({ default: () => <div data-testid="chat-stub" /> }));
vi.mock("../components/live/GoLiveButton.tsx", () => ({ default: () => <div /> }));
vi.mock("../components/live/HighlightButton.tsx", () => ({ default: () => <div /> }));
vi.mock("../services/gameService.ts", () => ({ getGameById: vi.fn() }));

const mockedGet = vi.mocked(getGameById);

const aiSeat: SafeUserInfo = {
  username: "dep-1", // an AI seat's username IS its deployment id
  display: "MyBot",
  createdAt: new Date(0),
  isAi: true,
};
const opponent: SafeUserInfo = { username: "bob", display: "Bob", createdAt: new Date(0) };
// The viewer (alice) is the deployment's OWNER but is NOT a seat by username.
const viewer: SafeUserInfo = { username: "alice", display: "Alice", createdAt: new Date(0) };

function aiGame(): GameInfo {
  return {
    gameId: "g-1",
    type: "nim",
    status: "active",
    chat: "c-1",
    players: [aiSeat, opponent],
    createdAt: new Date(0),
    createdBy: viewer,
    minPlayers: 2,
  };
}

function renderGame(emit = vi.fn()): ReturnType<typeof vi.fn> {
  const socket = { emit } as unknown as GameSocket;
  render(
    <LoginContext.Provider value={{ user: viewer, pass: "pw", reset: () => {}, socket }}>
      <MemoryRouter initialEntries={["/game/g-1"]}>
        <Routes>
          <Route path="/game/:gameId" element={<Game />} />
        </Routes>
      </MemoryRouter>
    </LoginContext.Provider>,
  );
  return emit;
}

beforeEach(() => {
  mockedGet.mockReset();
  mockedGet.mockResolvedValue(aiGame());
  window.sessionStorage.clear();
});

describe("Game page — forfeit when my AI is playing for me", () => {
  it("shows the Forfeit button to the deployment's owner (not a seat by username)", async () => {
    // The tab that ran deploy-and-play carries the queue session for this game.
    window.sessionStorage.setItem(
      queueSessionKey("nim"),
      serializeQueueSession({
        gameKey: "nim",
        rated: true,
        deploymentId: "dep-1",
        modelId: "m-1",
        modelName: "MyBot",
        autoRequeue: false,
        requeueLimit: 0,
        played: 0,
        lastCountedGameId: null,
      }),
    );
    const emit = renderGame();

    // The owner watches the match but can still pull the plug.
    expect(await screen.findByTestId("forfeit")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("forfeit"));
    await userEvent.click(screen.getByTestId("forfeit-confirm-yes"));
    expect(emit).toHaveBeenCalledWith("gameForfeit", {
      auth: { username: "alice", password: "pw" },
      payload: "g-1",
    });
  });

  it("does NOT show Forfeit to a bystander with no queue session for this game", async () => {
    // No queueSession → alice is a pure spectator of someone else's AI game.
    const emit = renderGame();
    expect(await screen.findByTestId("game-panel-stub")).toBeInTheDocument();
    expect(screen.queryByTestId("forfeit")).not.toBeInTheDocument();
    expect(emit).not.toHaveBeenCalled();
  });
});
