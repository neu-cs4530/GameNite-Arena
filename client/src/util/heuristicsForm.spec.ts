import { describe, expect, it } from "vitest";
import { HEURISTICS_EXTRA_KEY, trainingHeuristicFields } from "@gamenite/shared";
import {
  buildHeuristicsExtra,
  defaultHeuristicSelections,
  heuristicFieldsFor,
  mergeExtraConfig,
  splitHeuristicsExtra,
} from "./heuristicsForm.ts";

/**
 * The new-run form's bridge to the shared training-heuristics catalog: the
 * dropdowns render from the field lists, their values ride inside
 * config.extra under HEURISTICS_EXTRA_KEY, and the power-user JSON textarea
 * keeps working alongside (heuristics win on key collision).
 */

const nimDefaults = {
  opponentStyle: "misere-blunder-25",
  startingPile: "random-8-21",
  rewardShaping: "none",
};

describe("heuristicFieldsFor", () => {
  it("returns the shared field list for games that have one", () => {
    expect(heuristicFieldsFor("nim")).toBe(trainingHeuristicFields.nim);
  });

  it("returns null for games without tunables", () => {
    expect(heuristicFieldsFor("guess")).toBeNull();
    expect(heuristicFieldsFor("connect4")).toBeNull();
  });
});

describe("defaultHeuristicSelections", () => {
  it("selects every field's default", () => {
    expect(defaultHeuristicSelections("nim")).toEqual(nimDefaults);
  });

  it("is null for games without tunables", () => {
    expect(defaultHeuristicSelections("guess")).toBeNull();
  });
});

describe("buildHeuristicsExtra", () => {
  it("wraps the selections under the shared extra key", () => {
    const selections = { ...nimDefaults, opponentStyle: "uniform-random" };
    expect(buildHeuristicsExtra("nim", selections)).toEqual({
      [HEURISTICS_EXTRA_KEY]: selections,
    });
  });

  it("returns null for games without tunables", () => {
    expect(buildHeuristicsExtra("guess", {})).toBeNull();
  });

  it("repairs unknown option values back to that field's default", () => {
    const built = buildHeuristicsExtra("nim", { ...nimDefaults, opponentStyle: "cheat-mode" });
    expect(built).toEqual({ [HEURISTICS_EXTRA_KEY]: nimDefaults });
  });

  it("drops keys that are not fields of this game", () => {
    const built = buildHeuristicsExtra("nim", { ...nimDefaults, smuggled: "value" });
    expect(built).toEqual({ [HEURISTICS_EXTRA_KEY]: nimDefaults });
  });
});

describe("mergeExtraConfig", () => {
  it("is undefined when there is nothing from either source", () => {
    expect(mergeExtraConfig(undefined, null)).toBeUndefined();
  });

  it("passes a textarea-only config through", () => {
    expect(mergeExtraConfig({ hiddenSize: 128 }, null)).toEqual({ hiddenSize: 128 });
  });

  it("passes a heuristics-only config through", () => {
    const heuristics = { [HEURISTICS_EXTRA_KEY]: nimDefaults };
    expect(mergeExtraConfig(undefined, heuristics)).toEqual(heuristics);
  });

  it("merges both, heuristics winning on key collision, without mutating", () => {
    const textarea = { hiddenSize: 128, [HEURISTICS_EXTRA_KEY]: { opponentStyle: "stale" } };
    const heuristics = { [HEURISTICS_EXTRA_KEY]: nimDefaults };
    expect(mergeExtraConfig(textarea, heuristics)).toEqual({
      hiddenSize: 128,
      [HEURISTICS_EXTRA_KEY]: nimDefaults,
    });
    // The caller's textarea object is left alone.
    expect(textarea[HEURISTICS_EXTRA_KEY]).toEqual({ opponentStyle: "stale" });
  });
});

describe("splitHeuristicsExtra (run-again prefill)", () => {
  it("recovers selections via parseHeuristics and keeps the rest for the textarea", () => {
    const extra = {
      hiddenSize: 128,
      [HEURISTICS_EXTRA_KEY]: { ...nimDefaults, opponentStyle: "uniform-random" },
    };
    expect(splitHeuristicsExtra("nim", extra)).toEqual({
      selections: { ...nimDefaults, opponentStyle: "uniform-random" },
      rest: { hiddenSize: 128 },
    });
  });

  it("leaves rest undefined when the heuristics were the only extra", () => {
    const extra = { [HEURISTICS_EXTRA_KEY]: nimDefaults };
    expect(splitHeuristicsExtra("nim", extra)).toEqual({
      selections: nimDefaults,
      rest: undefined,
    });
  });

  it("handles a job with no extra config at all", () => {
    expect(splitHeuristicsExtra("nim", undefined)).toEqual({
      selections: nimDefaults,
      rest: undefined,
    });
  });

  it("has no selections for games without tunables but preserves the extras", () => {
    expect(splitHeuristicsExtra("guess", { hiddenSize: 64 })).toEqual({
      selections: null,
      rest: { hiddenSize: 64 },
    });
  });

  it("falls back to null selections on garbled stored heuristics", () => {
    const extra = { [HEURISTICS_EXTRA_KEY]: { opponentStyle: 42 } };
    expect(splitHeuristicsExtra("nim", extra)).toEqual({ selections: null, rest: undefined });
  });
});
