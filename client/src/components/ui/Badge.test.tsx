import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Badge from "./Badge.tsx";

describe("Badge", () => {
  it("renders its label and applies the variant class", () => {
    render(
      <Badge variant="win" testId="b">
        Win
      </Badge>,
    );
    const badge = screen.getByTestId("b");
    expect(badge).toHaveTextContent("Win");
    expect(badge.className).toContain("ga-badge--win");
  });

  it("renders an optional icon and title", () => {
    render(
      <Badge testId="b" icon={<span data-testid="icon" />} title="hover text">
        Live
      </Badge>,
    );
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByTestId("b")).toHaveAttribute("title", "hover text");
  });

  it("falls back to the default variant", () => {
    render(<Badge testId="b">Plain</Badge>);
    expect(screen.getByTestId("b").className).toContain("ga-badge--default");
  });
});
