import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { BroadcastInfo, GameInfo } from "@gamenite/shared";
import { listLiveBroadcasts } from "../services/broadcastService.ts";
import { getGameById } from "../services/gameService.ts";
import { getPlayerRating } from "../services/ratingService.ts";
import useLiveBroadcasts from "./useLiveBroadcasts.ts";

vi.mock("../services/broadcastService.ts", () => ({ listLiveBroadcasts: vi.fn() }));
vi.mock("../services/gameService.ts", () => ({ getGameById: vi.fn() }));
vi.mock("../services/ratingService.ts", () => ({ getPlayerRating: vi.fn() }));

const mockedList = vi.mocked(listLiveBroadcasts);
const mockedGame = vi.mocked(getGameById);
const mockedRating = vi.mocked(getPlayerRating);

const broadcast = { broadcastId: "b1", gameId: "g1", startedAt: "2026-06-01" } as BroadcastInfo;

function gameWith(players: { username: string; isAi?: boolean }[]): GameInfo {
  return { type: "nim", players } as unknown as GameInfo;
}

function rating(value: number, gamesPlayed: number) {
  return { rating: value, gamesPlayed } as Awaited<ReturnType<typeof getPlayerRating>>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useLiveBroadcasts", () => {
  it("enriches a broadcast with its game type and the highest known Elo", async () => {
    mockedList.mockResolvedValueOnce([broadcast]);
    mockedGame.mockResolvedValueOnce(gameWith([{ username: "ada" }, { username: "bob" }]));
    mockedRating.mockResolvedValueOnce(rating(1200, 5)).mockResolvedValueOnce(rating(1400, 9));

    const { result } = renderHook(() => useLiveBroadcasts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].gameKey).toBe("nim");
    expect(result.current.data?.[0].elo).toBe(1400); // max of the two
  });

  it("drops a broadcast whose game can't be loaded", async () => {
    mockedList.mockResolvedValueOnce([broadcast]);
    mockedGame.mockRejectedValueOnce(new Error("gone"));

    const { result } = renderHook(() => useLiveBroadcasts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual([]);
  });

  it("leaves Elo null when no human has a rated game, and skips AI seats", async () => {
    mockedList.mockResolvedValueOnce([broadcast]);
    mockedGame.mockResolvedValueOnce(
      gameWith([{ username: "ada" }, { username: "ai-bot", isAi: true }]),
    );
    // the one human is provisional (0 games played) → not counted
    mockedRating.mockResolvedValueOnce(rating(1500, 0));

    const { result } = renderHook(() => useLiveBroadcasts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data?.[0].elo).toBeNull();
    // only the human seat was looked up, not the AI one
    expect(mockedRating).toHaveBeenCalledTimes(1);
  });
});
