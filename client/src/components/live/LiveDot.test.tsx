import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import LiveDot from "./LiveDot.tsx";

describe("LiveDot", () => {
  it("defaults its label to LIVE", () => {
    render(<LiveDot testId="dot" />);
    expect(screen.getByTestId("dot")).toHaveTextContent("LIVE");
  });

  it("uses a custom label when given one", () => {
    render(<LiveDot testId="dot" label="REC" />);
    expect(screen.getByTestId("dot")).toHaveTextContent("REC");
  });

  it("announces itself politely for screen readers", () => {
    render(<LiveDot testId="dot" />);
    expect(screen.getByTestId("dot")).toHaveAttribute("role", "status");
  });
});
