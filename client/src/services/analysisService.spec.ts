import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AnalysisResult } from "../util/types.ts";
import { api } from "./api.ts";
import { analyzeReplay } from "./analysisService.ts";

vi.mock("./api.ts", () => ({
  api: { post: vi.fn(), get: vi.fn() },
}));

const mockedPost = vi.mocked(api.post);

const AUTH = { username: "user1", password: "pwd1111" };

function serverResult(matchId: string): AnalysisResult {
  return { matchId, generatedAt: "2026-06-09T00:00:00.000Z", perMove: [] };
}

describe("analyzeReplay request contract", () => {
  beforeEach(() => {
    mockedPost.mockReset();
  });

  it("posts the authed body with the chosen deployment and returns the server result", async () => {
    mockedPost.mockResolvedValueOnce({ data: serverResult("m1") });

    const result = await analyzeReplay("m1", { auth: AUTH, deploymentId: "dep-1" });

    expect(mockedPost).toHaveBeenCalledWith("/api/replay/m1/analysis", {
      auth: AUTH,
      payload: { deploymentId: "dep-1" },
    });
    expect(result.matchId).toBe("m1");
  });

  it("omits the deployment (built-in heuristic) when none is selected", async () => {
    mockedPost.mockResolvedValueOnce({ data: serverResult("m2") });

    await analyzeReplay("m2", { auth: AUTH });

    expect(mockedPost).toHaveBeenCalledWith("/api/replay/m2/analysis", {
      auth: AUTH,
      payload: { deploymentId: undefined },
    });
  });

  it("never calls the authed endpoint without credentials (falls back to the local engine)", async () => {
    // mock-match-1 is keyed in the fixture, so the fallback resolves without
    // touching the network.
    const result = await analyzeReplay("mock-match-1");

    expect(mockedPost).not.toHaveBeenCalled();
    expect(result.matchId).toBe("mock-match-1");
  });
});
