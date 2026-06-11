import "./TierBadge.css";
import { tierFromRating, type Tier } from "../../util/tiers.ts";
import type { JSX } from "react";

interface TierBadgeProps {
  rating: number;
  withRating?: boolean;
  className?: string;
}

const tierClass: Record<Tier, string> = {
  bronze: "ga-tier--bronze",
  silver: "ga-tier--silver",
  gold: "ga-tier--gold",
  platinum: "ga-tier--platinum",
  diamond: "ga-tier--diamond",
};

/**
 * Tier chip. Background color is wired directly to `--color-tier-*` (no -soft
 * tint) because the design-tokens e2e test compares the badge's computed
 * background-color to the raw tier token value.
 */
export default function TierBadge({ rating, withRating, className }: TierBadgeProps): JSX.Element {
  const tier = tierFromRating(rating);
  return (
    <span
      className={`ga-tier ${tierClass[tier.tier]} ${className ?? ""}`.trim()}
      title={`${tier.label} tier`}
      data-testid={`tier-badge-${tier.tier}`}
    >
      {withRating ? `${tier.label} · ${rating}` : tier.label}
    </span>
  );
}
