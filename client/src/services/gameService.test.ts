import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameInfo } from "@gamenite/shared";
import { api } from "./api.ts";
import { gameList, getGameById } from "./gameService.ts";

vi.mock("./api.ts", () => ({
  api: { get: vi.fn() },
}));

const mockedGet = vi.mocked(api.get);

// A minimal stand-in for a real game. We only read a couple of fields in
// these services, so the cast keeps the fixture short.
const game = { gameId: "g1", status: "active", players: [] } as unknown as GameInfo;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("gameService.getGameById", () => {
  it("GETs /api/game/:id and returns the game", async () => {
    mockedGet.mockResolvedValueOnce({ data: game });
    await expect(getGameById("g1")).resolves.toBe(game);
    expect(mockedGet).toHaveBeenCalledWith("/api/game/g1");
  });

  it("throws when the response carries an error message", async () => {
    mockedGet.mockResolvedValueOnce({ data: { error: "not found" } });
    await expect(getGameById("nope")).rejects.toThrow("not found");
  });
});

describe("gameService.gameList", () => {
  it("GETs /api/game/list and returns the array as-is", async () => {
    mockedGet.mockResolvedValueOnce({ data: [game] });
    await expect(gameList()).resolves.toEqual([game]);
    expect(mockedGet).toHaveBeenCalledWith("/api/game/list");
  });

  it("throws when the response is an error message instead of a list", async () => {
    mockedGet.mockResolvedValueOnce({ data: { error: "boom" } });
    await expect(gameList()).rejects.toThrow("boom");
  });
});
