import { describe, expect, it } from "vitest";
import { tierFromRating } from "./tiers.ts";

describe("tiers.tierFromRating", () => {
  it("maps a rating to the first tier whose minimum it meets", () => {
    expect(tierFromRating(2000).tier).toBe("diamond");
    expect(tierFromRating(1750).tier).toBe("platinum");
    expect(tierFromRating(1500).tier).toBe("gold");
    expect(tierFromRating(1300).tier).toBe("silver");
  });

  it("returns the exact boundary tier (min is inclusive)", () => {
    expect(tierFromRating(1900).tier).toBe("diamond");
  });

  it("falls back to bronze for low ratings", () => {
    expect(tierFromRating(0).tier).toBe("bronze");
    expect(tierFromRating(999).tier).toBe("bronze");
  });

  it("falls back to the lowest tier for a non-numeric rating", () => {
    // NaN >= min is always false, so `.find` returns nothing and the `??`
    // fallback kicks in.
    expect(tierFromRating(NaN).tier).toBe("bronze");
  });
});
