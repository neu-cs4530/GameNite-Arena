import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api.ts";
import {
  countActiveForGame,
  listDeploymentViews,
  listOwnModels,
} from "./trainerViewService.ts";
import type { DeploymentView } from "@gamenite/shared";

vi.mock("./api.ts", () => ({
  api: { get: vi.fn() },
}));

const mockedGet = vi.mocked(api.get);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listDeploymentViews", () => {
  it("returns the deployments array from the response", async () => {
    const deployments = [{ deploymentId: "d1" }];
    mockedGet.mockResolvedValueOnce({ data: { deployments } });
    await expect(listDeploymentViews("user0")).resolves.toBe(deployments);
    expect(mockedGet).toHaveBeenCalledWith("/api/deployment/list", { params: { username: "user0" } });
  });
});

describe("countActiveForGame", () => {
  const views = [
    { deploymentId: "d1", gameKey: "nim", status: "active" },
    { deploymentId: "d2", gameKey: "nim", status: "paused" },
    { deploymentId: "d3", gameKey: "tictactoe", status: "active" },
    { deploymentId: "d4", gameKey: "nim", status: "active" },
  ] as DeploymentView[];

  it("counts only active deployments for the given game", () => {
    expect(countActiveForGame(views, "nim")).toBe(2);
  });

  it("returns 0 when no deployments match", () => {
    expect(countActiveForGame(views, "checkers")).toBe(0);
  });
});

describe("listOwnModels", () => {
  it("maps models and marks hasArtifact true when artifactRef is present", async () => {
    mockedGet.mockResolvedValueOnce({
      data: [
        {
          modelId: "m1",
          displayName: "Bot A",
          gameKey: "nim",
          visibility: "private",
          artifactRef: "m1.pth",
          updatedAt: "2024-01-02T00:00:00Z",
          owner: { username: "u", display: "U" },
          createdAt: "2024-01-01T00:00:00Z",
        },
      ],
    });
    const result = await listOwnModels("user0");
    expect(result[0].hasArtifact).toBe(true);
  });

  it("marks hasArtifact false when artifactRef is absent", async () => {
    mockedGet.mockResolvedValueOnce({
      data: [
        {
          modelId: "m2",
          displayName: "Bot B",
          gameKey: "nim",
          visibility: "public",
          updatedAt: "2024-01-01T00:00:00Z",
          owner: { username: "u", display: "U" },
          createdAt: "2024-01-01T00:00:00Z",
        },
      ],
    });
    const result = await listOwnModels("user0");
    expect(result[0].hasArtifact).toBe(false);
  });

  it("sorts newest-updated first", async () => {
    mockedGet.mockResolvedValueOnce({
      data: [
        { modelId: "old", displayName: "Old", gameKey: "nim", visibility: "private", updatedAt: "2024-01-01T00:00:00Z", owner: { username: "u", display: "U" }, createdAt: "2024-01-01T00:00:00Z" },
        { modelId: "new", displayName: "New", gameKey: "nim", visibility: "private", updatedAt: "2024-06-01T00:00:00Z", owner: { username: "u", display: "U" }, createdAt: "2024-01-01T00:00:00Z" },
      ],
    });
    const result = await listOwnModels("user0");
    expect(result[0].modelId).toBe("new");
  });
});
