/**
 * Tier thresholds for rating-based badges (`<TierBadge>`).
 * Edit ranges in one place and the cascade propagates.
 */

export type Tier = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export interface TierThreshold {
  tier: Tier;
  /** Inclusive minimum rating to qualify for the tier. */
  min: number;
  label: string;
}

export const TIER_THRESHOLDS: readonly TierThreshold[] = [
  { tier: "diamond", min: 1900, label: "Diamond" },
  { tier: "platinum", min: 1700, label: "Platinum" },
  { tier: "gold", min: 1500, label: "Gold" },
  { tier: "silver", min: 1300, label: "Silver" },
  { tier: "bronze", min: 0, label: "Bronze" },
] as const;

/** Resolves a rating to the matching tier, falling back to bronze. */
export function tierFromRating(rating: number): TierThreshold {
  return (
    TIER_THRESHOLDS.find((t) => rating >= t.min) ?? TIER_THRESHOLDS[TIER_THRESHOLDS.length - 1]
  );
}
