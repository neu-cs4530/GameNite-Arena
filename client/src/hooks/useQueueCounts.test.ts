import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { fetchQueueCounts } from "../services/matchmakingService.ts";
import useQueueCounts from "./useQueueCounts.ts";

vi.mock("../services/matchmakingService.ts", () => ({ fetchQueueCounts: vi.fn() }));
const mockedFetch = vi.mocked(fetchQueueCounts);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useQueueCounts", () => {
  it("returns counts after the fetch resolves", async () => {
    mockedFetch.mockResolvedValue({ nim: { rated: 2, unrated: 1 } });
    const { result } = renderHook(() => useQueueCounts(10000));
    await waitFor(() => expect(result.current).toEqual({ nim: { rated: 2, unrated: 1 } }));
  });

  it("does not update state after unmount", async () => {
    let resolve: (v: Awaited<ReturnType<typeof fetchQueueCounts>>) => void;
    mockedFetch.mockReturnValueOnce(
      new Promise((res) => {
        resolve = res;
      }),
    );
    const { unmount } = renderHook(() => useQueueCounts(10000));
    unmount();
    resolve!({ nim: { rated: 3, unrated: 0 } });
    await Promise.resolve();
  });
});
