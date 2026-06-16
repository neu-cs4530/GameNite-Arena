import { describe, expect, it, vi, beforeEach } from "vitest";
import { AxiosError } from "axios";
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

  it("falls back to the mock engine when the server returns a 404 (fallback eligible)", async () => {
    const err = new AxiosError("Not found");
    err.response = {
      status: 404,
      data: {},
      headers: {},
      config: {} as never,
      statusText: "Not Found",
    };
    mockedPost.mockRejectedValueOnce(err);
    // mock-match-1 is in the fixture so the mock engine can serve it.
    const result = await analyzeReplay("mock-match-1", { auth: AUTH });
    expect(result.matchId).toBe("mock-match-1");
  });

  it("falls back to the mock engine when the server returns a 500 (fallback eligible)", async () => {
    const err = new AxiosError("Server error");
    err.response = {
      status: 500,
      data: {},
      headers: {},
      config: {} as never,
      statusText: "Internal Server Error",
    };
    mockedPost.mockRejectedValueOnce(err);
    const result = await analyzeReplay("mock-match-1", { auth: AUTH });
    expect(result.matchId).toBe("mock-match-1");
  });

  it("rethrows a 403 (not fallback-eligible) without hitting the mock engine", async () => {
    const err = new AxiosError("Forbidden");
    err.response = {
      status: 403,
      data: {},
      headers: {},
      config: {} as never,
      statusText: "Forbidden",
    };
    mockedPost.mockRejectedValueOnce(err);
    await expect(analyzeReplay("mock-match-1", { auth: AUTH })).rejects.toThrow();
  });

  it("synthesizes per-move flags for a match not in the pre-keyed fixture", async () => {
    // "synth-match-xxx" is not pre-keyed in mockAnalysis so the synthesis path runs.
    // We also mock api.get so getReplay can return a detail object.
    const mockedGet = vi.mocked(api.get);
    const detail: AnalysisResult & { moves: { index: number; actor: string; actorDisplayName: string; move: unknown; notation: string; timestamp: string }[] } = {
      matchId: "synth-match-xxx",
      generatedAt: new Date().toISOString(),
      perMove: [],
      moves: [
        { index: 0, actor: "u-a", actorDisplayName: "A", move: 1, notation: "take 1", timestamp: new Date().toISOString() },
        { index: 1, actor: "u-b", actorDisplayName: "B", move: 2, notation: "take 2", timestamp: new Date().toISOString() },
      ],
    };
    mockedGet.mockResolvedValueOnce({ data: detail });

    const result = await analyzeReplay("synth-match-xxx");

    expect(result.matchId).toBe("synth-match-xxx");
    expect(result.perMove).toHaveLength(2);
    expect(["blunder", "best", "inaccuracy", "neutral"]).toContain(result.perMove[0].flag);
  }, 5000);
});
