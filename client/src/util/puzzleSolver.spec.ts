import { describe, expect, it } from "vitest";
import type { DeploymentView } from "@gamenite/shared";
import { puzzleSolverOptions } from "./puzzleSolver.ts";

function dep(over: Partial<DeploymentView> = {}): DeploymentView {
  return {
    deploymentId: "d",
    modelId: "m",
    modelDisplayName: "Model",
    owner: { username: "u", display: "U" },
    gameKey: "nim",
    displayName: "Bot",
    status: "active",
    hasArtifact: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

describe("puzzleSolverOptions", () => {
  it("keeps only active, artifact-backed deployments for the game", () => {
    const deployments = [
      dep({ deploymentId: "ok", gameKey: "nim", status: "active", hasArtifact: true }),
      dep({ deploymentId: "wrong-game", gameKey: "connect4" }),
      dep({ deploymentId: "paused", status: "paused" }),
      dep({ deploymentId: "no-artifact", hasArtifact: false }),
    ];
    expect(puzzleSolverOptions(deployments, "nim").map((o) => o.deploymentId)).toEqual(["ok"]);
  });

  it("returns [] when the user has no eligible model for the game", () => {
    expect(puzzleSolverOptions([dep({ gameKey: "nim" })], "checkers")).toEqual([]);
  });

  it("labels with rounded rating when present, unrated with the bare name, strongest first", () => {
    const deployments = [
      dep({ deploymentId: "low", displayName: "Low", rating: { rating: 1200, gamesPlayed: 3 } }),
      dep({
        deploymentId: "high",
        displayName: "High",
        rating: { rating: 1800.6, gamesPlayed: 9 },
      }),
      dep({ deploymentId: "unrated", displayName: "Rookie" }),
    ];
    const opts = puzzleSolverOptions(deployments, "nim");
    expect(opts.map((o) => o.deploymentId)).toEqual(["high", "low", "unrated"]);
    expect(opts[0].label).toBe("High · 1801");
    expect(opts[2].label).toBe("Rookie");
  });
});
