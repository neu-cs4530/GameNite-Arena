import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import TierBadge from "./TierBadge.tsx";

describe("TierBadge", () => {
  it("picks the tier label and test-id from the rating", () => {
    render(<TierBadge rating={2000} />);
    const badge = screen.getByTestId("tier-badge-diamond");
    expect(badge).toHaveTextContent("Diamond");
    expect(badge.className).toContain("ga-tier--diamond");
  });

  it("appends the rating when withRating is set", () => {
    render(<TierBadge rating={1550} withRating />);
    expect(screen.getByTestId("tier-badge-gold")).toHaveTextContent("Gold · 1550");
  });

  it("falls back to bronze for low ratings", () => {
    render(<TierBadge rating={500} />);
    expect(screen.getByTestId("tier-badge-bronze")).toBeInTheDocument();
  });
});
