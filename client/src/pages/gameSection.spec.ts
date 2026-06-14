import { describe, expect, it } from "vitest";
import type { DeploymentView } from "@gamenite/shared";
import {
  activeDeploymentsFor,
  ctaState,
  deriveSelfStats,
  isAiPlayable,
  queueHref,
  resolveSeat,
  seatOptions,
  sectionLede,
} from "./gameSection.ts";
import type { LeaderboardEntry } from "../util/types.ts";

/**
 * View-model for the per-game section page (/games/:gameKey). Everything
 * the page decides — which deployments can take the seat, what the stats
 * strip shows, where the Play CTAs go — is derived here so the page itself
 * is pure wiring.
 */

function deployment(over: Partial<DeploymentView>): DeploymentView {
  return {
    deploymentId: "dep-1",
    modelId: "model-1",
    modelDisplayName: "Nimbus",
    owner: { username: "zara", display: "Zara" },
    gameKey: "nim",
    displayName: "Nimbus live",
    status: "active",
    hasArtifact: true,
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-02T00:00:00Z",
    ...over,
  };
}

function entry(over: Partial<LeaderboardEntry>): LeaderboardEntry {
  return {
    rank: 1,
    entityId: "u1",
    entityType: "human",
    displayName: "Zara",
    username: "zara",
    rating: 1530.4,
    rd: 80,
    gamesPlayed: 12,
    provisional: false,
    wins: 8,
    winRate: 8 / 12,
    ...over,
  };
}

describe("isAiPlayable", () => {
  it("mirrors the shared AI_PLAYABLE_GAME_KEYS list", () => {
    expect(isAiPlayable("nim")).toBe(true);
    expect(isAiPlayable("guess")).toBe(false);
  });
});

describe("sectionLede", () => {
  it("has a framing line for every playable game", () => {
    expect(sectionLede("nim")).toContain("last");
    expect(sectionLede("guess").length).toBeGreaterThan(0);
  });
});

describe("activeDeploymentsFor", () => {
  const deployments = [
    deployment({ deploymentId: "d-active-nim" }),
    deployment({ deploymentId: "d-paused-nim", status: "paused" }),
    deployment({ deploymentId: "d-retired-nim", status: "retired" }),
    deployment({ deploymentId: "d-active-other", gameKey: "checkers" }),
  ];

  it("keeps only active deployments for this game", () => {
    expect(activeDeploymentsFor(deployments, "nim").map((d) => d.deploymentId)).toEqual([
      "d-active-nim",
    ]);
  });

  it("is empty when nothing qualifies", () => {
    expect(activeDeploymentsFor([], "nim")).toEqual([]);
    expect(activeDeploymentsFor(deployments, "guess")).toEqual([]);
  });
});

describe("seatOptions", () => {
  it("always offers Myself first", () => {
    expect(seatOptions([])).toEqual([{ value: "self", label: "Myself" }]);
  });

  it("lists each deployment with its model rating when rated", () => {
    const rated = deployment({
      deploymentId: "d-rated",
      rating: { rating: 1610.7, gamesPlayed: 9 },
    });
    const unrated = deployment({ deploymentId: "d-unrated", displayName: "Fresh bot" });
    expect(seatOptions([rated, unrated])).toEqual([
      { value: "self", label: "Myself" },
      { value: "d-rated", label: "Nimbus live", rating: 1611 },
      { value: "d-unrated", label: "Fresh bot" },
    ]);
  });
});

describe("resolveSeat", () => {
  const deployments = [deployment({ deploymentId: "d-1" })];

  it("resolves the explicit self seat", () => {
    expect(resolveSeat("self", deployments)).toEqual({ kind: "self" });
  });

  it("resolves a known deployment", () => {
    expect(resolveSeat("d-1", deployments)).toEqual({
      kind: "deployment",
      deployment: deployments[0],
    });
  });

  it("falls back to self when the deployment vanished (paused elsewhere, stale id)", () => {
    expect(resolveSeat("d-gone", deployments)).toEqual({ kind: "self" });
  });
});

describe("ctaState", () => {
  it("self seat can always queue", () => {
    expect(ctaState({ kind: "self" })).toEqual({ enabled: true });
  });

  it("a deployed model with an artifact can queue", () => {
    expect(ctaState({ kind: "deployment", deployment: deployment({}) })).toEqual({
      enabled: true,
    });
  });

  it("a deployment without a trained artifact cannot take the seat", () => {
    const state = ctaState({
      kind: "deployment",
      deployment: deployment({ hasArtifact: false }),
    });
    expect(state.enabled).toBe(false);
    expect(state.reason).toMatch(/artifact/i);
  });
});

describe("queueHref", () => {
  it("builds the plain self queue link", () => {
    expect(queueHref("nim", false, { kind: "self" })).toBe("/games/queue/nim?rated=false");
    expect(queueHref("nim", true, { kind: "self" })).toBe("/games/queue/nim?rated=true");
  });

  it("carries the deployment seat into the queue page", () => {
    const seat = {
      kind: "deployment" as const,
      deployment: deployment({ deploymentId: "d 1", modelId: "m/1", displayName: "Bot & Co" }),
    };
    expect(queueHref("nim", true, seat)).toBe(
      "/games/queue/nim?rated=true&deploymentId=d+1&modelId=m%2F1&modelName=Bot+%26+Co",
    );
  });
});

describe("deriveSelfStats", () => {
  it("derives the stats strip from the viewer's board entry", () => {
    const entries = [
      entry({ rank: 3, username: "rival", entityId: "u9" }),
      entry({ rank: 7, username: "zara", rating: 1530.4, gamesPlayed: 12, wins: 8 }),
    ];
    expect(deriveSelfStats(entries, "zara")).toEqual({
      rank: 7,
      rating: 1530,
      rd: 80,
      gamesPlayed: 12,
      wins: 8,
      losses: 4,
      winRate: 8 / 12,
    });
  });

  it("is null until the viewer has rated games (honest empty stats strip)", () => {
    expect(deriveSelfStats([entry({ username: "rival" })], "zara")).toBeNull();
    expect(deriveSelfStats([], "zara")).toBeNull();
  });

  it("never matches an AI entry that shares the display name", () => {
    const ai = entry({ entityType: "ai", username: undefined, displayName: "zara" });
    expect(deriveSelfStats([ai], "zara")).toBeNull();
  });
});
