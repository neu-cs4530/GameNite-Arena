import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { TrainingPackEntry } from "@gamenite/shared";
import { fetchTrainingPack } from "../services/puzzleService.ts";
import useTrainingPack from "./useTrainingPack.ts";

vi.mock("../services/puzzleService.ts", () => ({ fetchTrainingPack: vi.fn() }));

const mockedFetch = vi.mocked(fetchTrainingPack);

function entry(id: string): TrainingPackEntry {
  return {
    gameKey: "nim",
    position: { remaining: 5, nextPlayer: 0 },
    sourceMatchId: id,
    createdAt: "2026-06-09T00:00:00.000Z",
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe("useTrainingPack: initial load", () => {
  it("is pending until the fetch resolves", () => {
    mockedFetch.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useTrainingPack("nim"));
    expect(result.current.status).toBe("pending");
  });

  it("is ok with mapped items after the fetch resolves", async () => {
    mockedFetch.mockResolvedValueOnce([entry("m1"), entry("m2")]);
    const { result } = renderHook(() => useTrainingPack("nim"));
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.items).toHaveLength(2);
  });

  it("is error when the fetch rejects", async () => {
    mockedFetch.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useTrainingPack("nim"));
    await waitFor(() => expect(result.current.status).toBe("error"));
  });
});

describe("useTrainingPack: gameKey change", () => {
  it("resets extra items when the game key changes", async () => {
    mockedFetch.mockResolvedValue([entry("m1")]);
    const { result, rerender } = renderHook((key: "nim" | "guess") => useTrainingPack(key), {
      initialProps: "nim" as "nim" | "guess",
    });
    await waitFor(() => expect(result.current.status).toBe("ok"));

    act(() => { rerender("guess"); });
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledWith("guess", expect.anything()));
    expect(result.current.items.length).toBeGreaterThanOrEqual(0);
  });
});

describe("useTrainingPack: loadMore", () => {
  it("appends a second batch", async () => {
    mockedFetch
      .mockResolvedValueOnce([entry("m1")])
      .mockResolvedValueOnce([entry("m2")]);
    const { result } = renderHook(() => useTrainingPack("nim"));
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.items).toHaveLength(1);

    act(() => { result.current.loadMore(); });
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(mockedFetch).toHaveBeenLastCalledWith("nim", { limit: 5, exclude: ["m1"] });
  });
});
