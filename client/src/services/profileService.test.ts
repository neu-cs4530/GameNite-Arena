import { describe, expect, it, vi, beforeEach } from "vitest";
import { AxiosError, type AxiosResponse } from "axios";
import { api } from "./api.ts";
import { getProfileSummary, ProfileNotFoundError } from "./profileService.ts";
import { profileSummaryFixture } from "../__fixtures__/profileSummary.ts";

vi.mock("./api.ts", () => ({
  api: { get: vi.fn() },
}));

const mockedGet = vi.mocked(api.get);

function axios404(): AxiosError {
  return new AxiosError("Request failed with status code 404", "ERR_BAD_REQUEST", undefined, null, {
    status: 404,
    statusText: "Not Found",
    headers: {},
    config: {},
    data: { error: "User not found" },
  } as AxiosResponse);
}

describe("profileService.getProfileSummary", () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  it("fetches /api/profile/:username and returns the summary verbatim", async () => {
    mockedGet.mockResolvedValueOnce({ data: profileSummaryFixture });
    const summary = await getProfileSummary("user0");
    expect(mockedGet).toHaveBeenCalledWith("/api/profile/user0");
    expect(summary).toBe(profileSummaryFixture);
  });

  it("throws ProfileNotFoundError on a 404 (unknown user)", async () => {
    mockedGet.mockRejectedValueOnce(axios404());
    await expect(getProfileSummary("nobody")).rejects.toBeInstanceOf(ProfileNotFoundError);
  });

  it("rethrows non-404 failures untouched — there is NO mock fallback", async () => {
    const boom = new Error("network down");
    mockedGet.mockRejectedValueOnce(boom);
    await expect(getProfileSummary("user0")).rejects.toBe(boom);
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });
});
