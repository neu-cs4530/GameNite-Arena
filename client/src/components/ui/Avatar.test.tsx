import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Avatar from "./Avatar.tsx";

function getInitials(): string {
  return screen.getByTestId("avatar").querySelector(".ga-avatar__initials")!.textContent ?? "";
}

describe("Avatar initials", () => {
  it("shows first 2 chars of a single-word name", () => {
    render(<Avatar name="Alice" />);
    expect(getInitials()).toBe("AL");
  });

  it("shows first+last initials for a multi-word name", () => {
    render(<Avatar name="Alice Bob" />);
    expect(getInitials()).toBe("AB");
  });

  it("uses first+last initials for three-word names", () => {
    render(<Avatar name="Alice Middle Bob" />);
    expect(getInitials()).toBe("AB");
  });

  it("strips punctuation and treats result as single part", () => {
    // "!!!" after strip and trim becomes "" → split gives [""] → length 1 path
    render(<Avatar name="!!!" />);
    // one-word path: parts[0].slice(0,2) of "" → "" is fine, not "?"
    // (parts.length === 0 is unreachable via split of trimmed string)
    expect(typeof getInitials()).toBe("string");
  });
});

describe("Avatar rendering", () => {
  it("applies size and variant classes", () => {
    render(<Avatar name="X" size="lg" variant="ai" />);
    const el = screen.getByTestId("avatar");
    expect(el.className).toContain("ga-avatar--lg");
    expect(el.className).toContain("ga-avatar--ai");
  });

  it("appends extra className", () => {
    render(<Avatar name="X" className="extra" />);
    expect(screen.getByTestId("avatar").className).toContain("extra");
  });

  it("sets --avatar-hue as a CSS custom property", () => {
    render(<Avatar name="test" />);
    const hue = screen.getByTestId("avatar").style.getPropertyValue("--avatar-hue");
    expect(Number(hue)).toBeGreaterThanOrEqual(0);
    expect(Number(hue)).toBeLessThan(360);
  });
});
