import { describe, expect, it } from "vitest";
import type { DeploymentView } from "@gamenite/shared";
import type { LeaderboardEntry } from "../util/types.ts";
import {
  activeDeploymentsFor,
  ctaState,
  deriveSelfStats,
  isAiPlayable,
  queueHref,
  resolveSeat,
  seatOptions,
  sectionLede,
  SELF_SEAT_VALUE,
} from "./gameSection.ts";

function deployment(overrides: Partial<DeploymentView>): DeploymentView {
  return {
    deploymentId: "d1",
    modelId: "m1",
    displayName: "My Bot",
    gameKey: "nim",
    status: "active",
    hasArtifact: true,
    ...overrides,
  } as DeploymentView;
}

describe("gameSection.sectionLede", () => {
  it("has a distinct lede for every playable game", () => {
    expect(sectionLede("nim")).toMatch(/pile/i);
    expect(sectionLede("guess")).toMatch(/secret number/i);
    expect(sectionLede("tictactoe")).toMatch(/three in a row/i);
    expect(sectionLede("connect4")).toMatch(/connect four/i);
    expect(sectionLede("checkers")).toMatch(/capture/i);
  });
});

describe("gameSection.isAiPlayable", () => {
  it("reflects the shared AI-playable contract", () => {
    // nim is AI-playable; guess is not (per AI_PLAYABLE_GAME_KEYS).
    expect(isAiPlayable("nim")).toBe(true);
    expect(isAiPlayable("guess")).toBe(false);
  });
});

describe("gameSection.activeDeploymentsFor", () => {
  it("keeps only active deployments for the requested game", () => {
    const out = activeDeploymentsFor(
      [
        deployment({ deploymentId: "a", gameKey: "nim", status: "active" }),
        deployment({ deploymentId: "b", gameKey: "nim", status: "paused" }),
        deployment({ deploymentId: "c", gameKey: "checkers", status: "active" }),
      ],
      "nim",
    );
    expect(out.map((d) => d.deploymentId)).toEqual(["a"]);
  });
});

describe("gameSection.seatOptions", () => {
  it("always lists Myself first, then deployments", () => {
    const out = seatOptions([deployment({ deploymentId: "d2", displayName: "Bot Two" })]);
    expect(out[0]).toEqual({ value: SELF_SEAT_VALUE, label: "Myself" });
    expect(out[1].value).toBe("d2");
  });

  it("includes a rounded rating only for rated models", () => {
    const rated = seatOptions([deployment({ rating: { rating: 1499.6 } as never })]);
    const unrated = seatOptions([deployment({ rating: undefined })]);
    expect(rated[1].rating).toBe(1500);
    expect(unrated[1].rating).toBeUndefined();
  });
});

describe("gameSection.resolveSeat", () => {
  const deployments = [deployment({ deploymentId: "d1" })];

  it("resolves a known deployment id", () => {
    const seat = resolveSeat("d1", deployments);
    expect(seat.kind).toBe("deployment");
  });

  it("falls back to self for the self value or a stale id", () => {
    expect(resolveSeat(SELF_SEAT_VALUE, deployments).kind).toBe("self");
    expect(resolveSeat("gone", deployments).kind).toBe("self");
  });
});

describe("gameSection.ctaState", () => {
  it("disables a deployment seat with no trained artifact", () => {
    const state = ctaState({ kind: "deployment", deployment: deployment({ hasArtifact: false }) });
    expect(state.enabled).toBe(false);
    expect(state.reason).toMatch(/no trained artifact/i);
  });

  it("enables a self seat and a deployment that has an artifact", () => {
    expect(ctaState({ kind: "self" }).enabled).toBe(true);
    expect(ctaState({ kind: "deployment", deployment: deployment({}) }).enabled).toBe(true);
  });
});

describe("gameSection.queueHref", () => {
  it("encodes the rated flag for a self seat", () => {
    expect(queueHref("nim", true, { kind: "self" })).toBe("/games/queue/nim?rated=true");
  });

  it("adds the model params for a deployment seat", () => {
    const href = queueHref("nim", false, { kind: "deployment", deployment: deployment({}) });
    expect(href).toContain("rated=false");
    expect(href).toContain("deploymentId=d1");
    expect(href).toContain("modelId=m1");
  });
});

describe("gameSection.deriveSelfStats", () => {
  const entry = {
    entityType: "human",
    username: "ada",
    rank: 4,
    rating: 1499.7,
    rd: 60,
    gamesPlayed: 10,
    wins: 6,
    winRate: 0.6,
  } as LeaderboardEntry;

  it("returns null when the user has no row", () => {
    expect(deriveSelfStats([entry], "bob")).toBeNull();
  });

  it("derives losses and rounds the rating from the user's row", () => {
    const stats = deriveSelfStats([entry], "ada");
    expect(stats).not.toBeNull();
    expect(stats?.rating).toBe(1500);
    expect(stats?.losses).toBe(4); // gamesPlayed - wins
  });
});
