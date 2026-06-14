import { describe, expect, it, vi, beforeEach } from "vitest";
import { AxiosError, type AxiosResponse } from "axios";
import { api } from "./api.ts";
import { listReplaysForUser } from "./replayService.ts";
import { defaultReplayFilters } from "../util/types.ts";

vi.mock("./api.ts", () => ({
  api: { get: vi.fn() },
}));

const mockedGet = vi.mocked(api.get);

function axios500(): AxiosError {
  return new AxiosError(
    "Request failed with status code 500",
    "ERR_BAD_RESPONSE",
    undefined,
    null,
    {
      status: 500,
      statusText: "Internal Server Error",
      headers: {},
      config: {},
      data: {},
    } as AxiosResponse,
  );
}

/**
 * The profile's per-user replay list must be REAL-only: unlike the shared
 * discovery feed, it never substitutes fixture replays. A server failure has
 * to propagate so the profile renders its error state instead of silently
 * showing mock data (the no-mock mandate).
 */
describe("replayService.listReplaysForUser (real-only)", () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  it("returns the server page verbatim", async () => {
    const pageData = { replays: [], total: 0, page: 1, pageSize: 12 };
    mockedGet.mockResolvedValueOnce({ data: pageData });
    const result = await listReplaysForUser("user0", defaultReplayFilters);
    expect(mockedGet).toHaveBeenCalledWith("/api/replay/list", expect.anything());
    expect(result).toBe(pageData);
  });

  it("propagates a 5xx instead of falling back to fixture replays", async () => {
    const boom = axios500();
    mockedGet.mockRejectedValueOnce(boom);
    await expect(listReplaysForUser("user0", defaultReplayFilters)).rejects.toBe(boom);
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });
});
