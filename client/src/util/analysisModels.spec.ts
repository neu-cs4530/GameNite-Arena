import { describe, expect, it } from "vitest";
import type { DeploymentView } from "@gamenite/shared";
import { analysisModelOptions } from "./analysisModels.ts";

/** Minimal DeploymentView factory — only the fields the helper reads matter. */
function dep(over: Partial<DeploymentView> = {}): DeploymentView {
  return {
    deploymentId: "dep-x",
    modelId: "model-x",
    modelDisplayName: "Bot X",
    owner: { username: "u", display: "U" },
    gameKey: "nim",
    displayName: "Bot X",
    status: "active",
    hasArtifact: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

describe("analysisModelOptions", () => {
  it("keeps only active, artifact-backed deployments for the requested game", () => {
    const deployments = [
      dep({ deploymentId: "ok", gameKey: "nim", status: "active", hasArtifact: true }),
      dep({ deploymentId: "wrong-game", gameKey: "connect4" }),
      dep({ deploymentId: "paused", gameKey: "nim", status: "paused" }),
      dep({ deploymentId: "retired", gameKey: "nim", status: "retired" }),
      dep({ deploymentId: "no-artifact", gameKey: "nim", hasArtifact: false }),
    ];

    const options = analysisModelOptions(deployments, "nim");

    expect(options.map((o) => o.deploymentId)).toEqual(["ok"]);
  });

  it("returns nothing for a game the user has no eligible models in", () => {
    const deployments = [dep({ gameKey: "nim" })];
    expect(analysisModelOptions(deployments, "checkers")).toEqual([]);
  });

  it("sorts strongest-rated first, then alphabetically by name", () => {
    const deployments = [
      dep({
        deploymentId: "low",
        modelDisplayName: "Alpha",
        rating: { rating: 1200, gamesPlayed: 5 },
      }),
      dep({
        deploymentId: "high",
        modelDisplayName: "Zeta",
        rating: { rating: 1800, gamesPlayed: 9 },
      }),
      dep({ deploymentId: "unrated-b", modelDisplayName: "Bravo" }),
      dep({ deploymentId: "unrated-a", modelDisplayName: "Aardvark" }),
    ];

    const options = analysisModelOptions(deployments, "nim");

    // Rated bots (desc by rating) come before unrated; unrated tie-break is
    // alphabetical by model name.
    expect(options.map((o) => o.deploymentId)).toEqual(["high", "low", "unrated-a", "unrated-b"]);
  });

  it("labels rated models with a rounded rating and unrated models with the bare name", () => {
    const deployments = [
      dep({
        deploymentId: "rated",
        modelDisplayName: "Champ",
        rating: { rating: 1622.7, gamesPlayed: 14 },
      }),
      dep({ deploymentId: "unrated", modelDisplayName: "Rookie" }),
    ];

    const byId = Object.fromEntries(
      analysisModelOptions(deployments, "nim").map((o) => [o.deploymentId, o.label]),
    );

    expect(byId.rated).toBe("Champ (1623)");
    expect(byId.unrated).toBe("Rookie");
  });
});
